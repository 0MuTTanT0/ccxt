'use strict';

class ArrayCache extends Array {

    constructor (maxSize = undefined) {
        super ()
        Object.defineProperty (this, 'maxSize', {
            __proto__: null, // make it invisible
            value: maxSize,
            writable: true,
        })
    }

    append (item) {
        this.push (item)
        // maxSize may be 0 when initialized by a .filter() copy-construction
        if (this.maxSize && (this.length > this.maxSize)) {
            this.shift ()
        }
    }

    clear () {
        this.length = 0
    }
}

class ArrayCacheById extends ArrayCache {

    constructor (maxSize = undefined) {
        super (maxSize)
        Object.defineProperty (this, 'hashmap', {
            __proto__: null, // make it invisible
            value: {},
            writable: true,
        })
    }

    append (item) {
        if (item.id in this.hashmap) {
            const reference = this.hashmap[item.id]
            if (reference !== item) {
                for (const prop in reference) {
                    delete reference[prop]
                }
                for (const prop in item) {
                    reference[prop] = item[prop]
                }
            }
        } else {
            this.hashmap[item.id] = item
            if (this.maxSize && (this.length === this.maxSize)) {
                const deleteReference = this.shift ()
                delete this.hashmap[deleteReference.id]
            }
            this.push (item)
        }
    }
}

class ArrayCacheBySymbolById extends ArrayCacheById {

    append (item) {
        const byId = this.hashmap[item.symbol] = this.hashmap[item.symbol] || {}
        if (item.id in byId) {
            const reference = byId[item.id]
            if (reference !== item) {
                for (const prop in reference) {
                    delete reference[prop]
                }
                for (const prop in item) {
                    reference[prop] = item[prop]
                }
            }
        } else {
            byId[item.id] = item
            if (this.maxSize && (this.length === this.maxSize)) {
                const deleteReference = this.shift ()
                delete byId[deleteReference.id]
            }
            this.push (item)
        }
    }
}

module.exports = {
    ArrayCache,
    ArrayCacheById,
    ArrayCacheBySymbolById,
}
