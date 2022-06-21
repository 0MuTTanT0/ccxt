<?php

namespace ccxtpro;

// rounding mode duplicated from CCXT
const TRUNCATE = 0;
const ROUND = 1;
const ROUND_UP = 2;
const ROUND_DOWN = 3;

class Exchange extends \ccxt\async\Exchange {

    // todo: fix version numbers in php

    public static $VERSION = 'undefined';

    use ClientTrait;
}

// the override below is technically an error
// todo: fix the conflict of ccxt.exchanges vs ccxtpro.exchanges

Exchange::$exchanges = array(
    'aax',
    'ascendex',
    'bequant',
    'binance',
    'binancecoinm',
    'binanceus',
    'binanceusdm',
    'bitcoincom',
    'bitfinex',
    'bitmart',
    'bitmex',
    'bitopro',
    'bitstamp',
    'bittrex',
    'bitvavo',
    'bybit',
    'cdax',
    'coinbaseprime',
    'coinbasepro',
    'coinex',
    'coinflex',
    'cryptocom',
    'currencycom',
    'ftx',
    'ftxus',
    'gate',
    'gateio',
    'hitbtc',
    'hollaex',
    'huobi',
    'huobijp',
    'huobipro',
    'idex',
    'kraken',
    'kucoin',
    'mexc',
    'ndax',
    'okcoin',
    'okex',
    'okx',
    'phemex',
    'poloniex',
    'ripio',
    'upbit',
    'zb',
    'zipmex',
);

