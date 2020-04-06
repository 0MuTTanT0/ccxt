'use strict';

//  ---------------------------------------------------------------------------
const Exchange = require ('./base/Exchange');
const { ArgumentsRequired, BadRequest, BadSymbol, OrderNotFound } = require ('./base/errors');
const { ROUND } = require ('./base/functions/number');
//  ---------------------------------------------------------------------------

module.exports = class levidge extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'levidge',
            'name': 'Levidge',
            'countries': ['US'], // Seychelles
            'rateLimit': 10,
            'certified': false,
            'has': {
                'CORS': false,
                'fetchMarkets': true,
                'fetchCurrencies': true,
                'fetchTradingLimits': false,
                'fetchTradingFees': true,
                'fetchFundingLimits': false,
                'fetchTicker': true,
                'fetchTickers': false,
                'fetchOrderBook': true,
                'fetchTrades': true,
                'fetchOHLCV': true,
                'fetchBalance': true,
                'fetchAccounts': false,
                'createOrder': true,
                'cancelOrder': true,
                'editOrder': false,
                'fetchOrder': true,
                'fetchOrders': true,
                'fetchAllOrders': true,
                'fetchOpenOrders': true,
                'fetchClosedOrders': true,
                'fetchCancelledOrders': true,
                'fetchMyTrades': true,
                'fetchDepositAddress': true,
                'fetchDeposits': true,
                'fetchWithdrawals': true,
                'fetchTransactions': true,
                'withdraw': true,
                'fetchLedger': false,
            },
            'timeframes': {
                '1m': 1,
                '5m': 2,
                '15m': 3,
                '1h': 4,
                '6h': 5,
                '1d': 6,
                '7d': 7,
            },
            'urls': {
                'logo': 'https://levidge.com/assets/LevidgeLogo.png',
                'api': {
                    'public': 'https://trading-api.dexp-dev.com/api/',
                    'private': 'https://trading-api.dexp-dev.com/api/',
                },
                'www': 'https://levidge.com',
                'doc': [
                    'https://levidge.com/api-doc/en.html#introduction',
                ],
            },
            'api': {
                'public': {
                    'get': [
                        'getInstrumentPairs',
                        'getInstruments',
                        'getChart',
                        'getOrderBook',
                        'getTradeHistory',
                        'getExchangeInfo',
                    ],
                    'post': [
                        'logon',
                    ],
                },
                'private': {
                    'post': [
                        'getPositions',
                        'order',
                        'getOrder',
                        'getOrders',
                        'cancelOrder',
                        'cancelReplaceOrder',
                        'getDepositAddresses',
                        'getDepositHistory',
                        'getWithdrawRequests',
                        'sendWithdrawRequest',
                        'getUserHistory',
                    ],
                },
            },
            'requiredCredentials': {
                'apiKey': true,
                'secret': true,
                'uid': true,
                'login': false,
                'password': false,
                'twofa': false, // 2-factor authentication (one-time password key)
                'privateKey': false, // a "0x"-prefixed hexstring private key for a wallet
                'walletAddress': false, // the wallet address "0x"-prefixed hexstring
                'token': false, // reserved for HTTP auth in some cases
            },
        });
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetGetInstrumentPairs (params);
        const markets = [];
        const results = this.safeValue (response, 'instrumentPairs', []);
        for (let i = 0; i < results.length; i++) {
            markets.push (this.parseMarket (results[i]));
        }
        return markets;
    }

    async fetchCurrencies (params = {}) {
        const response = await this.publicGetGetInstruments (params);
        const currencies = [];
        const results = this.safeValue (response, 'instruments', []);
        for (let i = 0; i < results.length; i++) {
            currencies.push (this.parseCurrency (results[i]));
        }
        // we need this to parse Markets
        this.currencies_by_id = this.indexBy (currencies, 'id');
        return currencies;
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        if (!market && !market['active']) {
            throw new BadSymbol (this.id + ': symbol ' + symbol + ' is not listed');
        }
        const request = this.extend ({
            'pairId': market['id'],
            'timespan': 1,
        }, params);
        const response = await this.publicGetGetChart (this.extend (request, params));
        const charts = this.safeValue (response, 'chart', []);
        const chart = this.safeValue (charts, 0);
        // let volume = undefined;
        if (chart) {
            return this.parseTicker (chart, market);
        } else {
            return this.parseTicker (undefined, market);
        }
    }

    async fetchOHLCV (symbol, timeframe = '1m', since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        if (!market && !market['active']) {
            throw new BadSymbol (this.id + ': symbol ' + symbol + ' is not listed');
        }
        if (!this.timeframes[timeframe]) {
            throw new BadRequest (this.id + ': timeframe ' + timeframe + ' is not supported');
        }
        const request = this.extend ({
            'pairId': market['id'],
            'timespan': this.timeframes[timeframe],
        }, params);
        const response = await this.publicGetGetChart (this.extend (request, params));
        const results = this.safeValue (response, 'chart', []);
        return this.parseOHLCVs (results, market, timeframe, since, limit);
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        if (!market && !market['active']) {
            throw new BadSymbol (this.id + ': symbol ' + symbol + ' is not listed');
        }
        let request = this.extend ({
            'pairId': market['id'],
        }, params);
        // apply limit though does not work with API
        if (limit) {
            request = this.extend ({ 'limit': limit }, request);
        }
        const response = await this.publicGetGetOrderBook (this.extend (request, params));
        if (response) {
            const orderBook = {
                'bids': [],
                'asks': [],
            };
            const bidData = response['bids'];
            const askData = response['asks'];
            if (bidData) {
                for (let i = 0; i < bidData.length; i++) {
                    if (bidData[i]) {
                        const price = this.convertFromScale (bidData[i][0], market['precision']['price']);
                        const amount = this.convertFromScale (bidData[i][1], market['precision']['amount']);
                        if (price > 0 && amount > 0) {
                            orderBook['bids'].push ({
                                'price': price,
                                'amount': amount,
                            });
                        }
                    }
                }
            }
            if (askData) {
                for (let i = 0; i < askData.length; i++) {
                    if (askData[i]) {
                        const price = this.convertFromScale (askData[i][0], market['precision']['price']);
                        const amount = this.convertFromScale (askData[i][1], market['precision']['amount']);
                        if (price > 0 && amount > 0) {
                            orderBook['asks'].push ({
                                'price': price,
                                'amount': amount,
                            });
                        }
                    }
                }
            }
            return this.parseOrderBook (orderBook, undefined, 'bids', 'asks', 'price', 'amount');
        }
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        if (!market && !market['active']) {
            throw new BadSymbol (this.id + ': symbol ' + symbol + ' is not listed');
        }
        let request = this.extend ({
            'pairId': market['id'],
        }, params);
        // apply limit though does not work with API
        if (limit) {
            request = this.extend ({ 'limit': limit }, request);
        }
        const response = await this.publicGetGetTradeHistory (request);
        const trades = this.safeValue (response, 'trades', []);
        return this.parseTrades (trades, market, since, limit, params);
    }

    async fetchBalance (params = {}) {
        const response = await this.privatePostGetPositions (params);
        const positions = this.safeValue (response, 'positions', []);
        const balance = {};
        balance['info'] = response;
        balance['free'] = {};
        balance['used'] = {};
        balance['total'] = {};
        for (let i = 0; i < positions.length; i++) {
            const position = positions[i];
            if (position['assetType'] === 'ASSET') {
                const symbol = position['symbol'];
                const quantity = position['quantity'];
                const availableQuantity = position['availableQuantity'];
                const scale = position['quantity_scale'];
                const free = this.convertFromScale (availableQuantity, scale);
                const total = this.convertFromScale (quantity, scale);
                const used = parseFloat (this.decimalToPrecision (total - free, ROUND, scale));
                if (!balance[symbol]) {
                    balance[symbol] = this.account ();
                }
                balance[symbol]['free'] = free;
                balance[symbol]['used'] = used;
                balance[symbol]['total'] = free + used;
            }
        }
        return this.parseBalance (balance);
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        if (!market && !market['active']) {
            throw new BadSymbol (this.id + ': symbol ' + symbol + ' is not listed');
        }
        if (!type || !side || !amount) {
            throw new ArgumentsRequired (this.id + ': Order does not have enough arguments');
        }
        const request = this.createOrderRequest (market, type, side, amount, price, params);
        const order = await this.privatePostOrder (request);
        return {
            'info': order,
            'id': order['id'],
            'timestamp': undefined,
            'datetime': undefined,
            'lastTradeTimestamp': undefined,
            'symbol': market['symbol'],
            'type': type,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': undefined,
            'average': undefined,
            'filled': undefined,
            'remaining': undefined,
            'status': order['status'],
            'fee': undefined,
        };
    }

    createOrderRequest (market, type, side, amount, price = undefined, params = {}) {
        const amount_scale = this.getScale (amount);
        const price_scale = this.getScale (price);
        const stopPx = 0;
        const stopPx_scale = this.getScale (stopPx);
        const ordType = type === 'limit' ? 2 : 1;
        const requestSide = side === 'sell' ? 2 : 1;
        const request = {
            'id': 0,
            'instrumentId': market['id'],
            'symbol': market['symbol'],
            'side': requestSide,
            'ordType': ordType,
            'price': this.convertToScale (price, price_scale),
            'price_scale': price_scale,
            'quantity': this.convertToScale (amount, amount_scale),
            'quantity_scale': amount_scale,
            'stopPx': this.convertToScale (stopPx, stopPx_scale),
            'stopPx_scale': stopPx_scale,
            'targetStrategy': 0,
            'isHidden': 0,
            'timeInForce': 1,
        };
        return this.extend (request, params);
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        const openOrders = await this.fetchOpenOrders (symbol, undefined, undefined, params);
        const orders = this.filterBy (openOrders, 'id', id);
        if (!orders || orders.length <= 0) {
            throw new OrderNotFound (this.id + ': order id ' + id + 'is not found in open order');
        }
        const order = orders[0];
        const request = this.safeValue (order, 'info');
        request['origOrderId'] = this.safeValue (request, 'orderId');
        const response = await this.privatePostCancelOrder (this.extend (request, params));
        return this.extend ({ 'info': response }, order);
    }

    async editOrder (id, symbol, type, side, amount = undefined, price = undefined, params = {}) {
        const openOrders = await this.fetchOpenOrders (symbol, undefined, undefined, params);
        const orders = this.filterBy (openOrders, 'id', id);
        if (!orders || orders.length <= 0) {
            throw new OrderNotFound (this.id + ': order id ' + id + 'is not found in open order');
        }
        const order = orders[0];
        const market = this.market (symbol);
        if (!market && !market['active']) {
            throw new BadSymbol (this.id + ': symbol ' + symbol + ' is not listed');
        }
        if (!type || !side || !amount) {
            throw new ArgumentsRequired (this.id + ': Order does not have enough arguments');
        }
        const newOrderRequest = this.createOrderRequest (market, type, side, amount, price, params);
        const request = this.safeValue (order, 'info');
        newOrderRequest['origOrderId'] = this.safeValue (request, 'orderId');
        newOrderRequest['clOrdId'] = this.safeValue (request, 'clOrdId');
        const response = await this.privatePostCancelReplaceOrder (this.extend (newOrderRequest));
        return this.extend ({ 'info': response });
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        const orders = await this.fetchOrders (symbol, undefined, undefined, params);
        const order = this.filterBy (orders, 'id', id);
        return order[0];
    }

    async fetchOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = undefined;
        const request = {};
        if (symbol !== undefined) {
            market = this.market (symbol);
            if (!market && !market['active']) {
                throw new BadSymbol (this.id + ': symbol ' + symbol + ' is not listed');
            }
            request['symbol'] = market['symbol'];
        }
        if (limit) {
            request['limit'] = limit;
        }
        const response = await this.privatePostGetOrders (this.extend (request, params));
        const orders = this.parseOrders (this.safeValue (response, 'orders', []), market, since, limit, params);
        return orders;
    }

    async fetchAllOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        return this.fetchOrders (symbol, since, limit, params);
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        const orders = await this.fetchOrders (symbol, since, limit, params);
        const openOrders = this.filterByValueSinceLimit (orders, 'status', 'open', since, limit);
        return openOrders;
    }

    async fetchClosedOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        const orders = await this.fetchOrders (symbol, since, limit, params);
        const closeOrders = this.filterByValueSinceLimit (orders, 'status', 'closed', since, limit);
        return closeOrders;
    }

    async fetchCancelledOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        const orders = await this.fetchOrders (symbol, since, limit, params);
        const canceledOrders = this.filterByValueSinceLimit (orders, 'status', 'canceled', since, limit);
        return canceledOrders;
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        return this.fetchClosedOrders (symbol, since, limit, params);
    }

    async fetchDepositAddress (code, params = {}) {
        await this.loadMarkets ();
        const currency = this.getCurrency (code);
        const request = {
            'instrumentId': currency['id'],
        };
        const response = await this.privatePostGetDepositAddresses (this.extend (request, params));
        const addresses = this.safeValue (response, 'addresses', []);
        return this.parseDepositAddress (addresses);
    }

    async fetchDeposits (code = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {};
        let currency = undefined;
        if (code) {
            currency = this.getCurrency (code);
            request['instrumentId'] = currency['id'];
        }
        const response = await this.privatePostGetDepositHistory (this.extend (request, params));
        const deposits = this.safeValue (response, 'deposits', []);
        for (let i = 0; i < deposits.length; i++) {
            const deposit = deposits[i];
            deposit['type'] = 'deposit';
        }
        return this.parseTransactions (deposits, currency, since, limit);
    }

    async fetchWithdrawals (code = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {};
        let currency = undefined;
        if (code) {
            currency = this.getCurrency (code);
            request['instrumentId'] = currency['id'];
        }
        // getWithdrawRequests
        const response = await this.privatePostGetWithdrawRequests (this.extend (request, params));
        const withdrawals = this.safeValue (response, 'addresses', []);
        for (let i = 0; i < withdrawals.length; i++) {
            const deposit = withdrawals[i];
            deposit['type'] = 'withdrawal';
        }
        return this.parseTransactions (withdrawals, currency, since, limit);
    }

    async fetchTransactions (code = undefined, since = undefined, limit = undefined, params = {}) {
        const deposits = await this.fetchDeposits (code, since, undefined, params);
        const withdrawals = await this.fetchWithdrawals (code, since, undefined, params);
        let transactions = this.arrayConcat (deposits, withdrawals);
        // sort combined array result, latest first
        transactions = this.sortBy (transactions, 'timestamp', true);
        // lets apply limit on combined array
        if (limit) {
            return this.filterBySinceLimit (transactions, since, limit);
        }
        return transactions;
    }

    async withdraw (code, amount, address, tag = undefined, params = {}) {
        this.checkAddress (address);
        await this.loadMarkets ();
        const currency = this.getCurrency (code);
        const scale = this.getScale (amount);
        const quantity = this.convertToScale (amount, scale);
        const instrumentId = currency['id'];
        const symbol = currency['code'];
        const request = {
            'instrumentId': instrumentId,
            'symbol': symbol,
            'quantity': quantity,
            'quantity_scale': scale,
            'address': address,
        };
        // sendWithdrawRequest
        const response = await this.privatePostSendWithdrawRequest (this.extend (request, params));
        return {
            'info': response,
            'id': undefined,
        };
    }

    async fetchTradingFees (params = {}) {
        // getExchangeInfo
        const response = await this.publicGetGetExchangeInfo (params);
        const tradingFees = this.safeValue (response, 'spotFees', []);
        const taker = {};
        const maker = {};
        for (let i = 0; i < tradingFees.length; i++) {
            const tradingFee = tradingFees[i];
            if (this.safeString (tradingFee, 'tier')) {
                taker[tradingFee['tier']] = this.safeFloat (tradingFee, 'taker');
                maker[tradingFee['tier']] = this.safeFloat (tradingFee, 'maker');
            }
        }
        return {
            'info': tradingFees,
            'tierBased': true,
            'maker': maker,
            'taker': taker,
        };
    }

    async fetchTradingLimits (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        // getExchangeInfo
        const response = await this.publicGetGetExchangeInfo (params);
        const tradingLimits = this.safeValue (response, 'tradingLimits', []);
        // To-do parsing response when available
        return {
            'info': tradingLimits,
            'limits': {
                'amount': {
                    'min': undefined,
                    'max': undefined,
                },
                'price': {
                    'min': undefined,
                    'max': undefined,
                },
                'cost': {
                    'min': undefined,
                    'max': undefined,
                },
            },
        };
    }

    async fetchFundingLimits (params = {}) {
        // getExchangeInfo
        const response = await this.publicGetGetExchangeInfo (params);
        const withdrawLimits = this.safeValue (response, 'withdrawLimits', []);
        // TO-DO parse response when available
        return {
            'info': withdrawLimits,
            'withdraw': undefined,
        };
    }

    async fetchLedger (code = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {};
        let currency = undefined;
        if (code) {
            currency = this.getCurrency (code);
            request['instrumentId'] = currency['id'];
        }
        // getUserHistory
        const response = await this.privatePostGetUserHistory (this.extend (request, params));
        return response;
        // return this.parseLedger (response['data'], undefined, since, limit);
    }

    // async logon () {
    //     if (!this.isAuthenticated ()) {
    //         this.checkRequiredCredentials ();
    //         const request = {
    //             'login': this.login,
    //             'password': this.password,
    //         };
    //         const response = await this.publicPostLogon (request);
    //         this.userId = this.safeString (response, 'id');
    //         this.requestSecret = this.safeString (response, 'requestSecret');
    //         this.requestToken = this.safeString (response, 'requestToken');
    //         // console.log (this.userId, this.requestToken, this.requestSecret);
    //         if (!this.requestToken || !this.requestSecret || !this.userId) {
    //             throw new AuthenticationError (this.id + ': Either login or password is not correct');
    //         }
    //     }
    // }

    // isAuthenticated () {
    //     if (this.requestToken && this.requestSecret && this.userId) {
    //         return true;
    //     }
    //     return false;
    // }

    nonce () {
        return this.milliseconds ();
    }

    getCurrency (code) {
        const currencies = this.indexBy (this.currencies, 'code');
        code = code.toUpperCase ();
        const currency = currencies[code];
        if (!currency) {
            throw new BadSymbol (this.id + ': code ' + code + ' is not listed');
        }
        return currency;
    }

    parseOrder (order, market = undefined) {
        const status = this.parseOrderStatus (order);
        let symbol = undefined;
        if (market !== undefined) {
            symbol = market['symbol'];
        } else {
            const marketId = this.safeString (order, 'instrumentId');
            if (marketId in this.markets_by_id) {
                market = this.markets_by_id[marketId];
                symbol = market['symbol'];
            }
        }
        const timestamp = this.parse8601 (this.convertToISO8601Date (this.safeString (order, 'timeStamp')));
        const lastTradeTimestamp = timestamp;
        const price = this.convertFromScale (this.safeInteger (order, 'lastPx', 0), this.safeInteger (order, 'lastPx_scale', 0));
        const amount = this.convertFromScale (this.safeInteger (order, 'quantity', 0), this.safeInteger (order, 'quantity_scale', 0));
        const filled = this.convertFromScale (this.safeInteger (order, 'cumQty', 0), this.safeInteger (order, 'cumQty_scale', 0));
        const remaining = this.convertFromScale (this.safeInteger (order, 'leavesQty', 0), this.safeInteger (order, 'leavesQty_scale', 0));
        const average = this.convertFromScale (this.safeInteger (order, 'price', 0), this.safeInteger (order, 'price_scale', 0));
        let cost = undefined;
        if (filled !== 0) {
            if (average > 0) {
                cost = average * filled;
            } else if (price > 0) {
                cost = price * filled;
            }
        }
        let currencyCode = undefined;
        const currencyId = this.safeInteger (order, 'feeInstrumentId');
        if (currencyId) {
            const currency = this.currencies_by_id[currencyId];
            if (currency) {
                currencyCode = currency['code'];
            }
        }
        const feeTotal = this.convertFromScale (this.safeInteger (order, 'feeTotal', 0), this.safeInteger (order, 'fee_scale', 0));
        const fee = {                         // fee info, if available
            'currency': currencyCode,        // which currency the fee is (usually quote)
            'cost': feeTotal,           // the fee amount in that currency
            'rate': undefined,           // the fee rate (if available)
        };
        const id = this.safeString (order, 'orderId');
        const type = this.parseOrderType (this.safeStringLower (order, 'ordType'));
        const side = this.parserOrderSide (this.safeStringLower (order, 'side'));
        const trades = this.safeValue (order, 'trades', []);
        return {
            'info': order,
            'id': id,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': lastTradeTimestamp,
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': cost,
            'average': average,
            'filled': filled,
            'remaining': remaining,
            'status': status,
            'trades': trades,
            'fee': fee,
        };
    }

    parseMarket (market) {
        const id = market[0]; // instrumentId
        const symbol = market[1]; // symbol
        const splitSymbol = symbol.split ('/');
        let base = splitSymbol[0].toLowerCase ();
        let quote = splitSymbol[1].toLowerCase ();
        const baseId = market[3]; // baseId
        const quoteId = market[2]; // quotedId
        const baseCurrency = this.safeValue (this.currencies_by_id, baseId);
        const quoteCurrency = this.safeValue (this.currencies_by_id, quoteId);
        if (baseCurrency) {
            base = baseCurrency['code'].toLowerCase ();
        }
        if (quoteCurrency) {
            quote = quoteCurrency['code'].toLowerCase ();
        }
        const active = market[6] === 1 ? true : false; // status
        const precision = {
            'amount': market[5], // quantity_scale
            'price': market[4], // price_scale
            'cost': undefined,
        };
        const limits = {
            'amount': {
                'min': undefined,
                'max': undefined,
            },
            'price': {
                'min': undefined,
                'max': undefined,
            },
            'cost': {
                'min': undefined,
                'max': undefined,
            },
        };
        return {
            'id': id,
            'symbol': symbol,
            'base': base,
            'quote': quote,
            'baseId': baseId,
            'quoteId': quoteId,
            'active': active,
            'precision': precision,
            'limits': limits,
            'info': market,
        };
    }

    parseCurrency (currency) {
        const id = currency[0]; // instrumentId
        const code = currency[1]; // symbol
        const name = currency[6]; // name
        const active = currency[4] === 1 ? true : false; // status
        const precision = currency[2]; // price_scale
        const fee = currency[5]; // withdraw_fee
        const limits = {
            'amount': {
                'min': undefined,
                'max': undefined,
            },
            'price': {
                'min': undefined,
                'max': undefined,
            },
            'cost': {
                'min': undefined,
                'max': undefined,
            },
            'withdraw': {
                'min': undefined,
                'max': undefined,
            },
        };
        return {
            'id': id,
            'code': code,
            'name': name,
            'active': active,
            'precision': precision,
            'limits': limits,
            'fee': fee,
            'info': currency,
        };
    }

    parseTicker (ticker, market = undefined) {
        let timestamp = undefined;
        let datetime = undefined;
        let open = undefined;
        let high = undefined;
        let low = undefined;
        let close = undefined;
        // let volume = undefined;
        if (ticker) {
            timestamp = ticker[0];
            datetime = this.iso8601 (timestamp);
            open = this.convertFromScale (ticker[1], market['precision']['price']);
            high = this.convertFromScale (ticker[2], market['precision']['price']);
            low = this.convertFromScale (ticker[3], market['precision']['price']);
            close = this.convertFromScale (ticker[4], market['precision']['price']);
            // volume = this.convertToScale (chart[5], market['precision']['amount'])
        }
        return {
            'symbol': market['symbol'],
            'timestamp': timestamp,
            'datetime': datetime,
            'bid': undefined,
            'ask': undefined,
            'last': close,
            'high': high,
            'low': low,
            'bidVolume': undefined,
            'askVolume': undefined,
            'vwap': undefined,
            'open': open,
            'close': close,
            'previousClose': undefined,
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': undefined,
            'quoteVolume': undefined,
            'info': ticker,
        };
    }

    parseOHLCV (ohlcv, market = undefined, timeframe = '1m', since = undefined, limit = undefined) {
        const timestamp = ohlcv[0];
        const open = this.convertFromScale (ohlcv[1], market['precision']['price']);
        const high = this.convertFromScale (ohlcv[2], market['precision']['price']);
        const low = this.convertFromScale (ohlcv[3], market['precision']['price']);
        const close = this.convertFromScale (ohlcv[4], market['precision']['price']);
        const volume = this.convertFromScale (ohlcv[5], market['precision']['amount']);
        // volume = ohlcv[5];
        return [timestamp, open, high, low, close, volume];
    }

    parseTrade (trade, market) {
        const price = this.convertFromScale (this.safeInteger (trade, 0), market['precision']['price']);
        const amount = this.convertFromScale (this.safeInteger (trade, 1), market['precision']['amount']);
        const date = this.convertToISO8601Date (this.safeString (trade, 2));
        const timestamp = this.parse8601 (date);
        const dateTime = this.iso8601 (timestamp);
        const seqNumber = this.safeString (trade, 3);
        return {
            'info': { 'trade': trade },                    // the original decoded JSON as is
            'id': seqNumber,  // string trade id
            'timestamp': timestamp,              // Unix timestamp in milliseconds
            'datetime': dateTime,  // ISO8601 datetime with milliseconds
            'symbol': market['symbol'],                  // symbol
            'order': undefined,  // string order id or undefined/None/null
            'type': undefined,                    // order type, 'market', 'limit' or undefined/None/null
            'side': undefined,                      // direction of the trade, 'buy' or 'sell'
            'takerOrMaker': undefined,                    // string, 'taker' or 'maker'
            'price': price,                 // float price in quote currency
            'amount': amount,                        // amount of base currency
            'cost': undefined,                 // total cost (including fees), `price * amount`
            'fee': {                           // provided by exchange or calculated by ccxt
                'cost': undefined,                        // float
                'currency': undefined,                      // usually base currency for buys, quote currency for sells
                'rate': undefined,                          // the fee rate (if available)
            },
        };
    }

    isOpenOrder (order) {
        let condtionOne = false;
        let conditionTwo = false;
        if (order['execType'] === 'F' && order['leavesQty'] !== 0 && order['ordType'] !== '1') {
            condtionOne = true;
        }
        if (order['execType'] !== 'F' && order['execType'] !== '4' && order['execType'] !== '8' && order['execType'] !== 'B' && order['execType'] !== 'C' && order['ordType'] !== '1') {
            conditionTwo = true;
        }
        if ((condtionOne || conditionTwo) && order['ordStatus'] !== '8') {
            return true;
        } else {
            return false;
        }
    }

    isClosedOrder (order) {
        let condtionOne = false;
        let conditionTwo = false;
        if (order['execType'] !== '4' && order['execType'] !== '8' && order['ordStatus'] !== '8' && order['ordType'] === '1') {
            condtionOne = true;
        }
        if (order['execType'] === 'F' || order['execType'] === 'B' || order['execType'] === 'C') {
            conditionTwo = true;
        }
        if (condtionOne || (conditionTwo && order['cumQty'] !== 0)) {
            return true;
        } else {
            return false;
        }
    }

    isCancelledOrder (order) {
        let condtionOne = false;
        let conditionTwo = false;
        if (order['execType'] === '4' || order['execType'] === '8' || order['ordStatus'] === '8') {
            condtionOne = true;
        }
        if ((order['execType'] === 'B' || order['execType'] === 'C') && order['cumQty'] === 0) {
            conditionTwo = true;
        }
        if (condtionOne || conditionTwo) {
            return true;
        } else {
            return false;
        }
    }

    parseOrderStatus (order) {
        if (this.isOpenOrder (order)) {
            return 'open';
        } else if (this.isClosedOrder (order)) {
            return 'closed';
        } else if (this.isCancelledOrder (order)) {
            return 'canceled';
        } else {
            return undefined;
        }
        // const statuses = {
        //     '0': 'open',
        //     '1': 'partially filled',
        //     '2': 'filled',
        //     '3': 'done for day',
        //     '4': 'cancelled',
        //     '5': 'replaced',
        //     '6': 'pending cancel',
        //     '7': 'stopped',
        //     '8': 'rejected',
        //     '9': 'suspended',
        //     'A': 'pending New',
        //     'B': 'calculated',
        //     'C': 'expired',
        //     'D': ' accepted for bidding',
        //     'E': 'pending Replace',
        //     'F': 'trade', // (partial fill or fill)
        // };
        // return this.safeString (statuses, status, status);
    }

    parserOrderSide (side) {
        const sides = {
            '1': 'buy',
            '2': 'sell',
        };
        return this.safeString (sides, side, side);
    }

    parseOrderType (type) {
        const types = {
            '1': 'market',
            '2': 'limit',
            '3': 'stop',
            '4': 'stop limit',
        };
        return this.safeString (types, type, type);
    }

    parseDepositAddress (addresses) {
        const address = {
            'currency': undefined, // currency code
            'address': undefined,   // address in terms of requested currency
            'tag': undefined,           // tag / memo / paymentId for particular currencies (XRP, XMR, ...)
            'info': undefined,     // raw unparsed data as returned from the exchange
        };
        if (addresses && addresses.length > 0) {
            address['currency'] = this.safeString (addresses[0], 'symbol');
            address['address'] = this.safeString (addresses[0], 'address');
            address['info'] = addresses[0];
        }
        return address;
    }

    parseTransaction (transaction, currency = undefined) {
        const id = this.safeString (transaction, 'id');
        const txid = this.safeString (transaction, 'transactionId');
        const datetime = this.convertToISO8601Date (this.safeString (transaction, 'timestamp', ' '));
        const timestamp = this.parse8601 (datetime);
        const address = this.safeString (transaction, 'address');
        const type = this.safeString (transaction, 'type');
        const amount = this.safeFloat (transaction, 'balance_change');
        const code = this.safeString (transaction, 'symbol');
        const status = this.parseTransactionStatus (this.safeString (transaction, 'status'));
        return {
            'info': transaction,    // the JSON response from the exchange as is
            'id': id,    // exchange-specific transaction id, string
            'txid': txid,
            'timestamp': timestamp,             // timestamp in milliseconds
            'datetime': datetime, // ISO8601 string of the timestamp
            'addressFrom': undefined, // sender
            'address': address, // "from" or "to"
            'addressTo': undefined, // receiver
            'tagFrom': undefined, // "tag" or "memo" or "payment_id" associated with the sender
            'tag': undefined, // "tag" or "memo" or "payment_id" associated with the address
            'tagTo': undefined, // "tag" or "memo" or "payment_id" associated with the receiver
            'type': type,   // or 'withdrawal', string
            'amount': amount,     // float (does not include the fee)
            'currency': code,       // a common unified currency code, string
            'status': status,   // 'ok', 'failed', 'canceled', string
            'updated': undefined,  // UTC timestamp of most recent status change in ms
            'comment': undefined,
            'fee': {                 // the entire fee structure may be undefined
                'currency': undefined,   // a unified fee currency code
                'cost': undefined,      // float
                'rate': undefined,   // approximately, fee['cost'] / amount, float
            },
        };
    }

    parseTransactionStatus (status) {
        return status;
    }

    convertToISO8601Date (dateString) {
        // '20200328-10:31:01.575' -> '2020-03-28 12:42:48.000'
        const splits = dateString.split ('-');
        const partOne = this.safeString (splits, 0);
        const PartTwo = this.safeString (splits, 1);
        if (!partOne || !PartTwo) {
            return undefined;
        }
        if (partOne.length !== 8) {
            return undefined;
        }
        const date = partOne.slice (0, 4) + '-' + partOne.slice (4, 6) + '-' + partOne.slice (6, 8);
        const datetime = date + ' ' + PartTwo;
        return datetime;
    }

    convertFromScale (number, scale) {
        return this.fromWei (number, scale);
    }

    getScale (num) {
        const s = this.numberToString (num);
        return this.precisionFromString (s);
    }

    convertToScale (number, scale) {
        return parseInt (this.toWei (number, scale));
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let query = path;
        if (method === 'GET') {
            if (Object.keys (params).length) {
                query += '?' + this.urlencode (params);
            }
        } else if (method === 'POST') {
            const format = this.safeString (params, '_format');
            if (format !== undefined) {
                query += '?' + this.urlencode ({ '_format': format });
                params = this.omit (params, '_format');
            }
            headers = {
                'Content-Type': 'application/json',
            };
            params['nonce'] = this.nonce ();
            // not logon method add signature and requestToken
            if (api === 'private') {
                this.checkRequiredCredentials ();
                headers['requestToken'] = this.apiKey;
                params['userId'] = this.uid;
                body = this.json (params);
                const signature = this.hmac (body, this.secret, 'sha384').toString ();
                headers['signature'] = signature;
                body = body === undefined ? this.json (params) : body;
            }
        }
        const url = this.urls['api'][api] + query;
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }
};
