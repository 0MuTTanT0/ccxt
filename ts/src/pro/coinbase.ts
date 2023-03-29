'use strict';

//  ---------------------------------------------------------------------------

import coinbaseRest from '../coinbase.js';
import { ArgumentsRequired } from '../base/errors.js';
import { ArrayCacheBySymbolById } from '../base/ws/Cache.js';
import { Precise } from '../base/Precise.js';
//  ---------------------------------------------------------------------------

export default class coinbase extends coinbaseRest {
    describe () {
        return this.deepExtend (super.describe (), {
            'has': {
                'ws': true,
                'watchOHLCV': false,
                'watchOrderBook': true,
                'watchTicker': true,
                'watchTickers': true,
                'watchTrades': true,
                'watchBalance': false,
                'watchStatus': true,
                'watchOrders': true,
                'watchMyTrades': false,
            },
            'urls': {
                'api': {
                    'ws': 'wss://advanced-trade-ws.coinbase.com',
                },
            },
            'options': {
                'tradesLimit': 1000,
                'ordersLimit': 1000,
                'myTradesLimit': 1000,
                'sides': {
                    'bid': 'bids',
                    'offer': 'asks',
                },
            },
        });
    }

    async subscribe (name, symbol = undefined, params = {}) {
        /**
         * @ignore
         * @method
         * @description subscribes to a websocket channel
         * @see https://docs.cloud.coinbase.com/advanced-trade-api/docs/ws-overview#subscribe
         * @param {string} name the name of the channel
         * @param {string} symbol unified market symbol
         * @param {object} params extra parameters specific to the cex api endpoint
         * @returns {object} subscription to a websocket channel
         */
        await this.loadMarkets ();
        let market = undefined;
        let messageHash = name;
        let productIds = [];
        if (Array.isArray (symbol)) {
            const symbols = this.marketSymbols (symbol);
            const marketIds = this.marketIds (symbols);
            productIds = marketIds;
        } else if (symbol !== undefined) {
            market = this.market (symbol);
            messageHash = name + ':' + market['id'];
            productIds = [ market['id'] ];
        }
        const url = this.urls['api']['ws'];
        const timestamp = this.numberToString (this.seconds ());
        const auth = timestamp + name + productIds.join (',');
        const subscribe = {
            'type': 'subscribe',
            'product_ids': productIds,
            'channel': name,
            'api_key': this.apiKey,
            'timestamp': timestamp,
            'signature': this.hmac (this.encode (auth), this.encode (this.secret), 'sha256'),
        };
        return await this.watch (url, messageHash, subscribe, messageHash);
    }

    async watchTicker (symbol, params = {}) {
        /**
         * @method
         * @name coinbasepro#watchTicker
         * @description watches a price ticker, a statistical calculation with the information calculated over the past 24 hours for a specific market
         * @see https://docs.cloud.coinbase.com/advanced-trade-api/docs/ws-channels#ticker-channel
         * @param {string} symbol unified symbol of the market to fetch the ticker for
         * @param {object} params extra parameters specific to the coinbasepro api endpoint
         * @returns {object} a [ticker structure]{@link https://docs.ccxt.com/en/latest/manual.html#ticker-structure}
         */
        const name = 'ticker';
        return await this.subscribe (name, symbol, params);
    }

    async watchTickers (symbols = undefined, params = {}) {
        /**
         * @method
         * @name coinbasepro#watchTickers
         * @description watches a price ticker, a statistical calculation with the information calculated over the past 24 hours for a specific market
         * @see https://docs.cloud.coinbase.com/advanced-trade-api/docs/ws-channels#ticker-batch-channel
         * @param {[string]} symbols unified symbol of the market to fetch the ticker for
         * @param {object} params extra parameters specific to the coinbasepro api endpoint
         * @returns {object} a [ticker structure]{@link https://docs.ccxt.com/en/latest/manual.html#ticker-structure}
         */
        if (symbols === undefined) {
            throw new ArgumentsRequired (this.id + ' watchTickers requires a symbols argument');
        }
        const name = 'ticker_batch';
        const tickers = await this.subscribe (name, symbols, params);
        return tickers;
        // todo: like binance
        // const result = {};
        // for (let i = 0; i < tickers.length; i++) {
        //     const ticker = tickers[i];
        //     const tickerSymbol = ticker['symbol'];
        //     if (symbols === undefined || this.inArray (tickerSymbol, symbols)) {
        //         result[tickerSymbol] = ticker;
        //     }
        // }
        // const resultKeys = Object.keys (result);
        // const resultKeysLength = resultKeys.length;
        // if (resultKeysLength > 0) {
        //     if (this.newUpdates) {
        //         return result;
        //     }
        //     return this.filterByArray (this.tickers, 'symbol', symbols);
        // }
        // return await this.watchTickers (symbols, oriParams);
    }

    handleTicker (client, message) {
        //
        //    {
        //        "channel": "ticker",
        //        "client_id": "",
        //        "timestamp": "2023-02-09T20:30:37.167359596Z",
        //        "sequence_num": 0,
        //        "events": [
        //            {
        //                "type": "snapshot",
        //                "tickers": [
        //                    {
        //                        "type": "ticker",
        //                        "product_id": "BTC-USD",
        //                        "price": "21932.98",
        //                        "volume_24_h": "16038.28770938",
        //                        "low_24_h": "21835.29",
        //                        "high_24_h": "23011.18",
        //                        "low_52_w": "15460",
        //                        "high_52_w": "48240",
        //                        "price_percent_chg_24_h": "-4.15775596190603"
        //                    }
        //                ]
        //            }
        //        ]
        //    }
        //
        const channel = this.safeString (message, 'channel');
        this.parseRawTickersHelper (client, message, channel);
    }

    handleTickers (client, message) {
        //
        //    {
        //        "channel": "ticker_batch",
        //        "client_id": "",
        //        "timestamp": "2023-03-01T12:15:18.382173051Z",
        //        "sequence_num": 0,
        //        "events": [
        //            {
        //                "type": "snapshot",
        //                "tickers": [
        //                    {
        //                        "type": "ticker",
        //                        "product_id": "DOGE-USD",
        //                        "price": "0.08212",
        //                        "volume_24_h": "242556423.3",
        //                        "low_24_h": "0.07989",
        //                        "high_24_h": "0.08308",
        //                        "low_52_w": "0.04908",
        //                        "high_52_w": "0.1801",
        //                        "price_percent_chg_24_h": "0.50177456859626"
        //                    }
        //                ]
        //            }
        //        ]
        //    }
        //
        const channel = this.safeString (message, 'channel');
        this.parseRawTickersHelper (client, message, channel);
        client.resolve (Object.values (this.tickers), channel + ':');
    }

    parseRawTickersHelper (client, message, channel) {
        const events = this.safeValue (message, 'events', []);
        for (let i = 0; i < events.length; i++) {
            const tickersObj = events[i];
            const tickers = this.safeValue (tickersObj, 'tickers', []);
            for (let j = 0; j < tickers.length; j++) {
                const ticker = tickers[j];
                const result = this.parseWsTicker (ticker);
                const symbol = result['symbol'];
                this.tickers[symbol] = result;
                const wsMarketId = this.safeString (ticker, 'product_id');
                const messageHash = channel + ':' + wsMarketId;
                client.resolve (result, messageHash);
            }
            client.resolve (this.tickers, 'ticker_batch');
        }
    }

    parseWsTicker (ticker, market = undefined) {
        //
        //     {
        //         "type": "ticker",
        //         "product_id": "DOGE-USD",
        //         "price": "0.08212",
        //         "volume_24_h": "242556423.3",
        //         "low_24_h": "0.07989",
        //         "high_24_h": "0.08308",
        //         "low_52_w": "0.04908",
        //         "high_52_w": "0.1801",
        //         "price_percent_chg_24_h": "0.50177456859626"
        //     }
        //
        const marketId = this.safeString (ticker, 'product_id');
        const timestamp = undefined;
        const last = this.safeNumber (ticker, 'price');
        return this.safeTicker ({
            'info': ticker,
            'symbol': this.safeSymbol (marketId, market, '-'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': this.safeString (ticker, 'high_24_h'),
            'low': this.safeString (ticker, 'low_24_h'),
            'bid': undefined,
            'bidVolume': undefined,
            'ask': undefined,
            'askVolume': undefined,
            'vwap': undefined,
            'open': undefined,
            'close': last,
            'last': last,
            'previousClose': undefined,
            'change': undefined,
            'percentage': this.safeString (ticker, 'price_percent_chg_24_h'),
            'average': undefined,
            'baseVolume': this.safeString (ticker, 'volume_24_h'),
            'quoteVolume': undefined,
        });
    }

    async watchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        /**
         * @method
         * @name coinbasepro#watchTrades
         * @description get the list of most recent trades for a particular symbol
         * @see https://docs.cloud.coinbase.com/advanced-trade-api/docs/ws-channels#market-trades-channel
         * @param {string} symbol unified symbol of the market to fetch trades for
         * @param {int|undefined} since timestamp in ms of the earliest trade to fetch
         * @param {int|undefined} limit the maximum amount of trades to fetch
         * @param {object} params extra parameters specific to the coinbasepro api endpoint
         * @returns {[object]} a list of [trade structures]{@link https://docs.ccxt.com/en/latest/manual.html?#public-trades}
         */
        await this.loadMarkets ();
        symbol = this.symbol (symbol);
        const name = 'market_trades';
        const trades = await this.subscribe (name, symbol, params);
        if (this.newUpdates) {
            limit = trades.getLimit (symbol, limit);
        }
        return this.filterBySinceLimit (trades, since, limit, 'timestamp', true);
    }

    async watchOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        /**
         * @method
         * @name coinbasepro#watchOrders
         * @description watches information on multiple orders made by the user
         * @see https://docs.cloud.coinbase.com/advanced-trade-api/docs/ws-channels#user-channel
         * @param {string|undefined} symbol unified market symbol of the market orders were made in
         * @param {int|undefined} since the earliest time in ms to fetch orders for
         * @param {int|undefined} limit the maximum number of  orde structures to retrieve
         * @param {object} params extra parameters specific to the coinbasepro api endpoint
         * @returns {[object]} a list of [order structures]{@link https://docs.ccxt.com/en/latest/manual.html#order-structure}
         */
        await this.loadMarkets ();
        const name = 'user';
        const orders = await this.subscribe (name, symbol, params);
        if (this.newUpdates) {
            limit = orders.getLimit (symbol, limit);
        }
        return this.filterBySinceLimit (orders, since, limit, 'timestamp', true);
    }

    async watchOrderBook (symbol, limit = undefined, params = {}) {
        /**
         * @method
         * @name coinbasepro#watchOrderBook
         * @description watches information on open orders with bid (buy) and ask (sell) prices, volumes and other data
         * @see https://docs.cloud.coinbase.com/advanced-trade-api/docs/ws-channels#level2-channel
         * @param {string} symbol unified symbol of the market to fetch the order book for
         * @param {int|undefined} limit the maximum amount of order book entries to return
         * @param {object} params extra parameters specific to the coinbasepro api endpoint
         * @returns {object} A dictionary of [order book structures]{@link https://docs.ccxt.com/en/latest/manual.html#order-book-structure} indexed by market symbols
         */
        await this.loadMarkets ();
        const name = 'level2';
        const market = this.market (symbol);
        symbol = market['symbol'];
        const orderbook = await this.subscribe (name, symbol, params);
        return orderbook.limit ();
    }

    handleTrade (client, message) {
        //
        //    {
        //        "channel": "market_trades",
        //        "client_id": "",
        //        "timestamp": "2023-02-09T20:19:35.39625135Z",
        //        "sequence_num": 0,
        //        "events": [
        //            {
        //                "type": "snapshot",
        //                "trades": [
        //                    {
        //                        "trade_id": "000000000",
        //                        "product_id": "ETH-USD",
        //                        "price": "1260.01",
        //                        "size": "0.3",
        //                        "side": "BUY",
        //                        "time": "2019-08-14T20:42:27.265Z",
        //                    }
        //                ]
        //            }
        //        ]
        //    }
        //
        const events = this.safeValue (message, 'events');
        const event = this.safeValue (events, 0);
        const trades = this.safeValue (event, 'trades');
        const trade = this.safeValue (trades, 0);
        const marketId = this.safeString (trade, 'product_id');
        const messageHash = 'market_trades:' + marketId;
        const symbol = this.safeSymbol (marketId);
        let tradesArray = this.safeValue (this.trades, symbol);
        if (tradesArray === undefined) {
            const tradesLimit = this.safeInteger (this.options, 'tradesLimit', 1000);
            tradesArray = new ArrayCacheBySymbolById (tradesLimit);
            this.trades[symbol] = tradesArray;
        }
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const trades = this.safeValue (event, 'trades');
            for (let i = 0; i < trades.length; i++) {
                const item = trades[i];
                const trade = this.parseTrade (item);
                tradesArray.append (trade);
            }
        }
        client.resolve (tradesArray, messageHash);
        return message;
    }

    handleOrder (client, message) {
        //
        //    {
        //        "channel": "user",
        //        "client_id": "",
        //        "timestamp": "2023-02-09T20:33:57.609931463Z",
        //        "sequence_num": 0,
        //        "events": [
        //            {
        //                "type": "snapshot",
        //                "orders": [
        //                    {
        //                        "order_id": "XXX",
        //                        "client_order_id": "YYY",
        //                        "cumulative_quantity": "0",
        //                        "leaves_quantity": "0.000994",
        //                        "avg_price": "0",
        //                        "total_fees": "0",
        //                        "status": "OPEN",
        //                        "product_id": "BTC-USD",
        //                        "creation_time": "2022-12-07T19:42:18.719312Z",
        //                        "order_side": "BUY",
        //                        "order_type": "Limit"
        //                    },
        //                ]
        //            }
        //        ]
        //    }
        //
        const events = this.safeValue (message, 'events');
        const marketIds = [];
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const responseOrders = this.safeValue (event, 'orders');
            for (let j = 0; j < responseOrders.length; j++) {
                const responseOrder = responseOrders[j];
                const parsed = this.parseWsOrder (responseOrder);
                if (this.orders === undefined) {
                    const limit = this.safeInteger (this.options, 'ordersLimit', 1000);
                    this.orders = new ArrayCacheBySymbolById (limit);
                }
                const cachedOrders = this.orders;
                // const symbol = this.safeString (parsed, 'symbol');
                // const orderId = this.safeString (parsed, 'id');
                // const orders = this.safeValue (cachedOrders.hashmap, symbol, {});
                // const order = this.safeValue (orders, orderId);
                // if (order !== undefined) {
                //     // todo add others to calculate average etc
                //     const stopPrice = this.safeValue (order, 'stopPrice');
                //     if (stopPrice !== undefined) {
                //         parsed['stopPrice'] = stopPrice;
                //     }
                //     if (order['status'] === 'closed') {
                //         parsed['status'] = 'closed';
                //     }
                // }
                const marketId = this.safeString (responseOrder, 'product_id');
                if (!(marketId in marketIds)) {
                    marketIds.push (marketId);
                }
                cachedOrders.append (parsed);
            }
        }
        for (let i = 0; i < marketIds.length; i++) {
            const marketId = marketIds[i];
            const messageHash = 'user:' + marketId;
            client.resolve (this.orders, messageHash);
        }
        client.resolve (this.orders, 'user');
        // if (this.orders === undefined) {
        //     const limit = this.safeInteger (this.options, 'ordersLimit', 1000);
        //     this.orders = new ArrayCacheBySymbolById (limit);
        // }
        // const events = this.safeValue (message, 'events');
        // for (let i = 0; i < events.length; i++) {
        //     const event = events[i];
        //     const orders = this.safeValue (event, 'orders', []);
        //     for (let i = 0; i < orders.length; i++) {
        //         const order = this.parseWsOrder (orders[i]);
        //         const marketId = this.marketId (order['symbol']);
        //         if (!(marketId in this.orders)) {
        //             this.orders[marketId] = [];
        //         }
        //         this.orders[marketId].push (order);
        //     }
        //     const orderKeys = Object.keys (this.orders);
        //     for (let i = 0; i < orderKeys.length; i++) {
        //         const marketId = orderKeys[i];
        //         const messageHash = 'user:' + marketId;
        //         client.resolve (this.orders[marketId], messageHash);
        //     }
        //     client.resolve (this.orders, 'user');
        // }
        return message;
    }

    parseWsOrder (order, market = undefined) {
        //
        //    {
        //        "order_id": "XXX",
        //        "client_order_id": "YYY",
        //        "cumulative_quantity": "0",
        //        "leaves_quantity": "0.000994",
        //        "avg_price": "0",
        //        "total_fees": "0",
        //        "status": "OPEN",
        //        "product_id": "BTC-USD",
        //        "creation_time": "2022-12-07T19:42:18.719312Z",
        //        "order_side": "BUY",
        //        "order_type": "Limit"
        //    }
        //
        const id = this.safeString (order, 'order_id');
        const clientOrderId = this.safeString (order, 'client_order_id');
        const marketId = this.safeString (order, 'product_id');
        const datetime = this.safeString (order, 'time');
        return this.safeOrder ({
            'info': order,
            'symbol': this.safeSymbol (marketId),
            'id': id,
            'clientOrderId': clientOrderId,
            'timestamp': this.parse8601 (datetime),
            'datetime': datetime,
            'lastTradeTimestamp': undefined,
            'type': this.safeString (order, 'order_type'),
            'timeInForce': undefined,
            'postOnly': undefined,
            'side': this.safeString (order, 'side'),
            'price': undefined,
            'stopPrice': undefined,
            'triggerPrice': undefined,
            'amount': undefined,
            'cost': undefined,
            'average': this.safeString (order, 'avg_price'),
            'filled': this.safeString (order, 'cumulative_quantity'),
            'remaining': this.safeString (order, 'leaves_quantity'),
            'status': this.safeStringLower (order, 'status'),
            'fee': {
                'amount': this.safeString (order, 'total_fees'),
                'currency': undefined, // TODO
            },
            'trades': undefined,
        });
    }

    handleOrderBookHelper (orderbook, updates) {
        for (let i = 0; i < updates.length; i++) {
            const trade = updates[i];
            const sideId = this.safeString (trade, 'side');
            const side = this.safeString (this.options['sides'], sideId);
            const price = this.safeNumber (trade, 'price_level');
            const amount = this.safeNumber (trade, 'new_quantity');
            orderbook[side].store (price, amount);
        }
    }

    handleOrderBook (client, message) {
        //
        //    {
        //        "channel": "l2_data",
        //        "client_id": "",
        //        "timestamp": "2023-02-09T20:32:50.714964855Z",
        //        "sequence_num": 0,
        //        "events": [
        //            {
        //                "type": "snapshot",
        //                "product_id": "BTC-USD",
        //                "updates": [
        //                    {
        //                        "side": "bid",
        //                        "event_time": "1970-01-01T00:00:00Z",
        //                        "price_level": "21921.73",
        //                        "new_quantity": "0.06317902"
        //                    },
        //                    {
        //                        "side": "bid",
        //                        "event_time": "1970-01-01T00:00:00Z",
        //                        "price_level": "21921.3",
        //                        "new_quantity": "0.02"
        //                    },
        //                ]
        //            }
        //        ]
        //    }
        //
        const events = this.safeValue (message, 'events');
        const datetime = this.safeString (message, 'timestamp');
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const updates = this.safeValue (event, 'updates', []);
            const marketId = this.safeString (event, 'product_id');
            const messageHash = 'level2:' + marketId;
            const subscription = this.safeValue (client.subscriptions, messageHash, {});
            const limit = this.safeInteger (subscription, 'limit');
            const symbol = this.safeSymbol (marketId);
            const type = this.safeString (event, 'type');
            if (type === 'snapshot') {
                this.orderbooks[symbol] = this.orderBook ({}, limit);
                const orderbook = this.orderbooks[symbol];
                this.handleOrderBookHelper (orderbook, updates);
                orderbook['timestamp'] = undefined;
                orderbook['datetime'] = undefined;
                orderbook['symbol'] = symbol;
                client.resolve (orderbook, messageHash);
            } else if (type === 'update') {
                const orderbook = this.orderbooks[symbol];
                this.handleOrderBookHelper (orderbook, updates);
                orderbook['datetime'] = datetime;
                orderbook['timestamp'] = this.parse8601 (datetime);
                orderbook['symbol'] = symbol;
                client.resolve (orderbook, messageHash);
            }
        }
        return message;
    }

    handleSubscriptionStatus (client, message) {
        //
        //     {
        //         type: 'subscriptions',
        //         channels: [
        //             {
        //                 name: 'level2',
        //                 product_ids: [ 'ETH-BTC' ]
        //             }
        //         ]
        //     }
        //
        return message;
    }

    handleMessage (client, message) {
        const channel = this.safeString (message, 'channel');
        const methods = {
            'subscriptions': this.handleSubscriptionStatus,
            'ticker': this.handleTicker,
            'ticker_batch': this.handleTickers,
            'market_trades': this.handleTrade,
            'user': this.handleOrder,
            'l2_data': this.handleOrderBook,
        };
        const type = this.safeString (message, 'type');
        if (type === 'error') {
            const errorMessage = this.safeString (message, 'message');
            throw new Error (errorMessage);
        }
        const method = this.safeValue (methods, channel);
        return method.call (this, client, message);
    }
}
