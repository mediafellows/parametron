"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const bluebird_1 = __importDefault(require("bluebird"));
const chipmunk_1 = __importDefault(require("chipmunk"));
// enable promise cancelling
bluebird_1.default.config({ cancellation: true });
const apiFunctionsSync = ['get', 'fetch', 'pristine', 'getValues', 'ready', 'loading'];
const apiFunctionsAsync = ['clear', 'set', 'setPersistent', 'params'];
function createParametron(opts, config) {
    const update = lodash_1.get(opts, 'update', lodash_1.noop);
    const init = lodash_1.get(opts, 'init', lodash_1.noop);
    const immediate = lodash_1.get(opts, 'immediate', true);
    const instance = new Parametron(opts, config);
    const api = {};
    lodash_1.each(apiFunctionsSync, (fn) => {
        api[fn] = (...args) => {
            return instance[fn].apply(instance, args);
        };
    });
    lodash_1.each(apiFunctionsAsync, (fn) => {
        api[fn] = (...args) => {
            instance[fn].apply(instance, args);
            return api.fire();
        };
    });
    api.fire = () => {
        // triggers an update before firing that indicates already parametron is running from now on
        instance.prepare();
        update(instance.data);
        return instance.fire().then(() => update(instance.data));
    };
    if (init)
        init(instance);
    if (immediate)
        api.fire();
    return {
        data: instance.data,
        opts: instance.opts,
        api,
    };
}
exports.createParametron = createParametron;
const filterByAttributeMethod = (attribute, method) => {
    return (filter) => {
        const [attr, meth] = filter;
        if (attribute && method)
            return attribute === attr && method === meth;
        else if (attribute)
            return attribute === attr;
        else if (method)
            return method === meth;
        else
            return true;
    };
};
const initialParams = {
    page: 1,
    per: 24,
    sort: 'created_at',
    order: 'desc',
};
const initialData = {
    reqId: 0,
    running: false,
    filters: [],
    persistentFilters: [],
};
const emptyResults = {
    totalCount: 0,
    totalPages: 0,
    objects: [],
    aggregations: {},
};
class Parametron {
    constructor(opts, config) {
        this.chipmunk = chipmunk_1.default(config);
        this.opts = lodash_1.cloneDeep(lodash_1.merge({}, { params: initialParams }, opts));
        this.data = lodash_1.cloneDeep(lodash_1.merge({}, initialParams, initialData, emptyResults));
        if (lodash_1.isEmpty(this.opts.model))
            throw new Error(`parametron: 'model' option missing`);
    }
    /*
     * returns aggregation values, i.e. available values (if available)
     * @param {string} attribute  the attribute to get values for
     */
    getValues(attribute) {
        const aggregations = lodash_1.get(this.data, `aggregations.${attribute}`);
        return aggregations || [];
    }
    /*
     * clear filters
     * if no attribute nor method are provided: all filters are cleared
     * @param {string} [attribute] optional the attribute to clear filters for
     * @param {string} [method]    optional filter method (e.g. 'q', 'eq'...)
     */
    clear(attribute, method) {
        lodash_1.remove(this.data.filters, filterByAttributeMethod(attribute, method));
    }
    /*
     * get current filters for..
     * @param {string} attribute  the attribute to get filters for
     * @param {string} [method]   optional filter method (e.g. 'q', 'eq'...)
     */
    get(attribute, method) {
        return lodash_1.filter(this.data.filters, filterByAttributeMethod(attribute, method));
    }
    /*
     * get current applied filter value for..
     * this is a helper method that returns the applied filter values of the FIRST filter that matches the criteria
     *    Example 1:
     *    fetch('_', 'q')
     *    => 'Foo' // (the search string)
     *
     *    Example 2:
     *    fetch('year_of_production', 'range')
     *    => [1900, 2008]
     * @param {string} attribute  the attribute to get filters for
     * @param {string} method     filter method (e.g. 'q', 'eq'...)
     */
    fetch(attribute, method) {
        const applied = lodash_1.filter(this.data.filters, filterByAttributeMethod(attribute, method));
        const candidate = lodash_1.first(applied);
        const values = lodash_1.slice(candidate, 2); // omit attribute and method
        return values.length > 1 ? values : lodash_1.first(values);
    }
    /*
     * returns true if no filters have been applied (not taking into account persistent filters)
     */
    pristine() {
        return lodash_1.isEmpty(this.get());
    }
    /*
     * add a new filter
     * @param {string}                                   attribute  the attribute to set filters for
     * @param {string}                                   method     filter method (e.g. 'q', 'eq'...)
     * @param {Array<string | number> | string | number} value1     filter value 1
     * @param {Array<string | number> | string | number} value2     filter value 2
     */
    set(attribute, method, value1, value2) {
        switch (method) {
            case 'q':
                this.clear('_');
                break;
            case 'match':
                this.clear(attribute, 'match');
                break;
            case 'eq':
            case 'ne':
                this.clear(attribute, 'eq');
                this.clear(attribute, 'ne');
                break;
            case 'range':
            case 'in':
            case 'not_in':
                this.clear(attribute, 'range');
                this.clear(attribute, 'in');
                this.clear(attribute, 'not_in');
                break;
            case 'exist':
            case 'not_exist':
                this.clear(attribute, 'exist');
                this.clear(attribute, 'not_exist');
                break;
        }
        const condition = lodash_1.filter([attribute, method, value1, value2], (value) => !lodash_1.isNull(value) && !lodash_1.isUndefined(value));
        this.data.filters.push(condition);
        this.opts.params.page = 1;
    }
    /*
     * add a new filter
     * like 'set', but adds a persistent filter that cannot be removed again
     */
    setPersistent(attribute, method, value1, value2) {
        this.data.persistentFilters.push(lodash_1.compact([attribute, method, value1, value2]));
    }
    /**
     * allow modifying params in any way you like
     */
    params(params) {
        const newParams = lodash_1.merge({}, this.opts.params, params);
        this.opts.params = lodash_1.pickBy(newParams, (value) => !lodash_1.isNull(value) && !lodash_1.isUndefined(value));
        return this.opts.params;
    }
    // might be called before 'fire' to reset state
    prepare() {
        lodash_1.extend(this.data, { running: true, reqId: this.data.reqId + 1 }, lodash_1.pick(this.opts.params, 'page', 'per', 'sort', 'order'), emptyResults);
    }
    fire() {
        // cancel any pending request
        if (this.pact)
            this.pact.cancel();
        this.prepare();
        this.pact = new bluebird_1.default((resolve, reject) => {
            const filters = this.data.persistentFilters.concat(this.data.filters);
            const body = lodash_1.merge({}, this.opts.params, {
                search: { filters },
                stats: this.opts.stats,
            });
            const { params, schema } = this.opts;
            this.chipmunk.action(this.opts.model, this.opts.action || 'search', {
                body,
                params,
                schema,
            }).then((result) => {
                lodash_1.extend(this.data, {
                    running: false,
                    objects: result.objects,
                    aggregations: result.aggregations,
                    totalCount: result.pagination.total_count,
                    totalPages: result.pagination.total_pages,
                });
                resolve(this.data);
            })
                .catch((err) => {
                this.data.running = false;
                reject(err);
            });
        });
        return this.pact;
    }
}
exports.Parametron = Parametron;
