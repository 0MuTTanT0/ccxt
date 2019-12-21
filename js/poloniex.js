'use strict';

//  ---------------------------------------------------------------------------

const ccxt = require ('ccxt');
const { NotImplemented } = require ('ccxt/js/base/errors');

//  ---------------------------------------------------------------------------

module.exports = class poloniex extends ccxt.poloniex {
    describe () {
        return this.deepExtend (super.describe (), {
            'has': {
                'ws': true,
                'watchTicker': true,
                'watchOrderBook': true,
            },
            'urls': {
                'api': {
                    'ws': 'wss://api2.poloniex.com',
                },
            },
        });
    }

    handleTickers (client, response) {
        const data = response[2];
        const market = this.safeValue (this.options['marketsByNumericId'], data[0].toString ());
        const symbol = this.safeString (market, 'symbol');
        return {
            'info': response,
            'symbol': symbol,
            'last': parseFloat (data[1]),
            'ask': parseFloat (data[2]),
            'bid': parseFloat (data[3]),
            'change': parseFloat (data[4]),
            'baseVolume': parseFloat (data[5]),
            'quoteVolume': parseFloat (data[6]),
            'active': data[7] ? false : true,
            'high': parseFloat (data[8]),
            'low': parseFloat (data[9]),
        };
    }

    async watchBalance (params = {}) {
        await this.loadMarkets ();
        this.balance = await this.fetchBalance (params);
        const channelId = '1000';
        const subscribe = {
            'command': 'subscribe',
            'channel': channelId,
        };
        const messageHash = channelId + ':b:e';
        const url = this.urls['api']['ws'];
        return await this.watch (url, messageHash, subscribe, channelId);
    }

    async watchTickers (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        // rewrite
        throw new NotImplemented (this.id + 'watchTickers not implemented yet');
        // const market = this.market (symbol);
        // const numericId = market['info']['id'].toString ();
        // const url = this.urls['api']['websocket']['public'];
        // return await this.WsTickerMessage (url, '1002' + numericId, {
        //     'command': 'subscribe',
        //     'channel': 1002,
        // });
    }

    async loadMarkets (reload = false, params = {}) {
        const markets = await super.loadMarkets (reload, params);
        let marketsByNumericId = this.safeValue (this.options, 'marketsByNumericId');
        if ((marketsByNumericId === undefined) || reload) {
            marketsByNumericId = {};
            for (let i = 0; i < this.symbols.length; i++) {
                const symbol = this.symbols[i];
                const market = this.markets[symbol];
                const numericId = this.safeString (market, 'numericId');
                marketsByNumericId[numericId] = market;
            }
            this.options['marketsByNumericId'] = marketsByNumericId;
        }
        return markets;
    }

    async watchTrades (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const numericId = this.safeString (market, 'numericId');
        const messageHash = 'trades:' + numericId;
        const url = this.urls['api']['ws'];
        const subscribe = {
            'command': 'subscribe',
            'channel': numericId,
        };
        return await this.watch (url, messageHash, subscribe, numericId);
    }

    async watchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const numericId = this.safeString (market, 'numericId');
        const messageHash = 'orderbook:' + numericId;
        const url = this.urls['api']['ws'];
        const subscribe = {
            'command': 'subscribe',
            'channel': numericId,
        };
        const future = this.watch (url, messageHash, subscribe, numericId);
        return await this.after (future, this.limitOrderBook, symbol, limit, params);
    }

    limitOrderBook (orderbook, symbol, limit = undefined, params = {}) {
        return orderbook.limit (limit);
    }

    async watchHeartbeat (params = {}) {
        await this.loadMarkets ();
        const channelId = '1010';
        const url = this.urls['api']['ws'];
        return await this.watch (url, channelId);
    }

    signMessage (client, messageHash, message, params = {}) {
        if (messageHash.indexOf ('1000') === 0) {
            const throwOnError = false;
            if (this.checkRequiredCredentials (throwOnError)) {
                const nonce = this.nonce ();
                const payload = this.urlencode ({ 'nonce': nonce });
                const signature = this.hmac (this.encode (payload), this.encode (this.secret), 'sha512');
                message = this.extend (message, {
                    'key': this.apiKey,
                    'payload': payload,
                    'sign': signature,
                });
            }
        }
        return message;
    }

    handleHeartbeat (client, message) {
        //
        // every second (approx) if no other updates are sent
        //
        //     [ 1010 ]
        //
        const channelId = '1010';
        client.resolve (message, channelId);
    }

    parseWsTrade (client, trade, market = undefined) {
        //
        // public trades
        //
        //     [
        //         "t", // trade
        //         "42706057", // id
        //         1, // 1 = buy, 0 = sell
        //         "0.05567134", // price
        //         "0.00181421", // amount
        //         1522877119, // timestamp
        //     ]
        //
        const id = trade[1].toString ();
        const side = trade[2] ? 'buy' : 'sell';
        const price = parseFloat (trade[3]);
        const amount = parseFloat (trade[4]);
        const timestamp = trade[5] * 1000;
        let symbol = undefined;
        if (market !== undefined) {
            symbol = market['symbol'];
        }
        return {
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'id': id,
            'order': undefined,
            'type': undefined,
            'takerOrMaker': undefined,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': price * amount,
            'fee': undefined,
        };
    }

    handleOrderBookAndTrades (client, message) {
        //
        // first response
        //
        //     [
        //         14, // channelId === market['numericId']
        //         8767, // nonce
        //         [
        //             [
        //                 "i", // initial snapshot
        //                 {
        //                     "currencyPair": "BTC_BTS",
        //                     "orderBook": [
        //                         { "0.00001853": "2537.5637", "0.00001854": "1567238.172367" }, // asks, price, size
        //                         { "0.00001841": "3645.3647", "0.00001840": "1637.3647" } // bids
        //                     ]
        //                 }
        //             ]
        //         ]
        //     ]
        //
        // subsequent updates
        //
        //     [
        //         14,
        //         8768,
        //         [
        //             [ "o", 1, "0.00001823", "5534.6474" ], // orderbook delta, bids, price, size
        //             [ "o", 0, "0.00001824", "6575.464" ], // orderbook delta, asks, price, size
        //             [ "t", "42706057", 1, "0.05567134", "0.00181421", 1522877119 ] // trade, id, side (1 for buy, 0 for sell), price, size, timestamp
        //         ]
        //     ]
        //
        const marketId = message[0].toString ();
        const nonce = message[1];
        const data = message[2];
        const market = this.safeValue (this.options['marketsByNumericId'], marketId);
        const symbol = this.safeString (market, 'symbol');
        let orderbookUpdatesCount = 0;
        let tradesCount = 0;
        for (let i = 0; i < data.length; i++) {
            const delta = data[i];
            if (delta[0] === 'i') {
                const snapshot = this.safeValue (delta[1], 'orderBook', []);
                const sides = [ 'asks', 'bids' ];
                this.orderbooks[symbol] = this.orderbook ();
                const orderbook = this.orderbooks[symbol];
                for (let j = 0; j < snapshot.length; j++) {
                    const side = sides[j];
                    const bookside = orderbook[side];
                    const orders = snapshot[j];
                    const prices = Object.keys (orders);
                    for (let k = 0; k < prices.length; k++) {
                        const price = prices[k];
                        const amount = orders[price];
                        bookside.store (parseFloat (price), parseFloat (amount));
                    }
                }
                orderbook['nonce'] = nonce;
                orderbookUpdatesCount += 1;
            } else if (delta[0] === 'o') {
                const orderbook = this.orderbooks[symbol];
                const side = delta[1] ? 'bids' : 'asks';
                const bookside = orderbook[side];
                const price = parseFloat (delta[2]);
                const amount = parseFloat (delta[3]);
                bookside.store (price, amount);
                orderbookUpdatesCount += 1;
            } else if (delta[0] === 't') {
                // todo: add max limit to the dequeue of trades, unshift and push
                const trade = this.parseWsTrade (client, delta, market);
                this.trades.push (trade);
                tradesCount += 1;
            }
        }
        if (orderbookUpdatesCount) {
            // resolve the orderbook future
            const messageHash = 'orderbook:' + marketId;
            const orderbook = this.orderbooks[symbol];
            // the .limit () operation will be moved to the watchOrderBook
            client.resolve (orderbook, messageHash);
        }
        if (tradesCount) {
            // resolve the trades future
            const messageHash = 'trades:' + marketId;
            // todo: incremental trades
            client.resolve (this.trades, messageHash);
        }
    }

    handleAccountNotifications (client, message) {
        // not implemented yet
        // throw new NotImplemented (this.id + 'watchTickers not implemented yet');
        return message;
    }

    handleMessage (client, message) {
        const channelId = this.safeString (message, 0);
        const market = this.safeValue (this.options['marketsByNumericId'], channelId);
        if (market === undefined) {
            const methods = {
                // '<numericId>': 'handleOrderBookAndTrades', // Price Aggregated Book
                '1000': 'handleAccountNotifications', // Beta
                '1002': 'handleTickers', // Ticker Data
                // '1003': undefined, // 24 Hour Exchange Volume
                '1010': 'handleHeartbeat',
            };
            const method = this.safeString (methods, channelId);
            if (method === undefined) {
                return message;
            } else {
                return this[method] (client, message);
            }
        } else {
            return this.handleOrderBookAndTrades (client, message);
        }
    }
};
