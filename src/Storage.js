import PouchDB from 'pouchdb';

PouchDB.plugin(require('pouchdb-find').default);

export function db(name, options) {
    return new PouchDB(name, options);
}

const global = db(process.env.VUE_APP_DB_NAME || 'capsule');

export function execute(method, key, ...args) {
    if(Array.isArray(key)) {
        const promises = key.map(key => method(key).then(data => {
            return [key, data];
        }, e => {
            return [key, null];
        }));

        return Promise.all(promises).then(data => {
            return data.reduce((carry, [key, value]) => {
                return Object.assign({[key]: value }, carry);
            }, {});
        });
    }
    else {
        return method(key, ...args);
    }
}

export function promise(value) {
    if(value instanceof Promise) {
        return value;
    }

    if(typeof value === 'function') {
        return promise(value());
    }

    return Promise.resolve(value);
}

export function id(doc) {
    return doc && doc._id || doc;
}

export function isJson(value) {
    try {
        return typeof value === 'object' && !!JSON.stringify(value);
    }
    catch (e) {
        return false;
    }
}

export function config(key, value, ...args) {
    if(typeof value === 'undefined') {
        return get(key, ...args).then(({ value }) => value);
    }

    return save(key, {
        key,
        value
    }).then(({ value }) => value);
}

export function find(selector) {
    return global.find({
        selector: Object.assign({
            $config: {
                $exists: false
            }
        }, selector)
    });
}

export function get(key, ...args) {
    return execute(global.get, Array.isArray(key) ? key.map(key => id(key)) : key, ...args);
}

export function post(doc, ...args) {
    return new Promise((resolve, reject) => {
        execute(global.post, doc, ...args).then(({ id }) => {
            get(id).then(resolve, reject);
        }, reject);
    });
}

export function put(doc, ...args) {
    const { _id } = doc;
    
    return new Promise((resolve, reject) => {
        find({ _id }).then(({ docs }) => {
            if(docs.length === 1) {
                const { _rev } = docs.pop();

                Object.assign(doc, { _rev });
            }

            execute(global.put, doc, ...args).then(({ id }) => {
                get(id).then(resolve, reject);
            }, reject);
        });
    });
}

export function remove(key, ...args) {
    return new Promise((resolve, reject) => {
        execute(global.remove, key, ...args).then(resolve, reject);
    });
}

export function save(doc, value, ...args) {
    if(Array.isArray(doc)) {
        return execute(save, doc, value, ...args);    
    }

    if(!Object.keys(value).length || !isJson(doc) && !isJson(value)) {
        return config(doc, value, ...args);
    }
    
    if(typeof doc === 'string') {
        doc = Object.assign({_id: doc}, value);
    }

    return !doc._id ? post(doc) : put(doc);
}

export function findCache(key) {
    return global.find({
        selector: {
            key,
            $cache: { $exists: true },
            $or: [{
                $expired: { $eq: null },
            }, {
                $expired: { $gt: new Date().getTime() },
            }]
        }
    }).then(({ docs: [ doc ] }) => doc);
}

export function isExpired(key) {
    return new Promise((resolve, reject) => {
        findCache(key).then(doc => {
            resolve(!doc);
        }, reject);
    });
}

export function purge(key) {
    return new Promise((resolve, reject) => {
        global.find({
            selector: {
                key,
                $cache: { $exists: true }
            }
        }).then(({ docs }) => {
            Promise.all(docs.map(doc => remove(doc))).then(resolve, reject);
        }, reject);
    });
}

export function clearExpired(key) {
    return new Promise((resolve, reject) => {
        global.find({
            selector: {
                key,
                $cache: { $exists: true },
                $and: [{
                    $expired: { $lte: new Date().getTime() }
                }, {
                    $expired: { $ne: null }
                }],
            }
        }).then(({ docs }) => {
            Promise.all(docs.map(doc => remove(doc))).then(resolve, reject);
        }, reject);
    });
}

export function cache(key, data, length = null) {
    if(data === null) {
        return purge(key);
    }

    if(typeof data === 'undefined') {
        return findCache(key).then(doc => doc && doc.data);
    }

    return new Promise((resolve, reject) => {
        const $expired = typeof length === 'number' && new Date().getTime() + length * 1000 || null;

        clearExpired(key).then(() => {
            findCache(key).then(doc => {
                if(!doc) {
                    promise(data).then(data => {
                        data = {
                            key,
                            data,
                            $expired,
                            $cache: true,
                            $cachedAt: new Date().getTime()
                        };

                        post(Object.assign({}, doc, data))
                            .then(({ data }) => {
                                resolve(data);
                            }, reject);
                    }, reject);
                }
                else {
                    resolve(doc.data);
                }
            }, reject);
        }, reject);
    });
}

export default global;