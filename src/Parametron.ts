import { IResult, IActionOpts } from "@mediafellows/chipmunk";
import * as queryString from './queryString';

export interface IParametronOpts {
  executor: (opts: IActionOpts) => Promise<IResult>;
  stats?: string;
  schema?: string;
  init?: (api: Parametron) => void;
  update?: (data: IParametronData) => void;
  serializeToURL?: boolean;
}

export interface IParametronData {
  // internals
  reqId: number;
  running: boolean;

  // state
  params: { [s: string]: any };
  filters?: any[][];
  persistentFilters?: any[][];

  // results
  totalCount: number;
  totalPages: number;
  objects?: any[];
  aggregations?: any;
}

export interface IParametronApi {
  getAggregations(attribute: string): any[];
  getFilters(attribute?: string, method?: string): any;
  getFilterValues(attribute: string, method: string): any;

  setFilter(
    attribute: "_" | "+main",
    method: "q",
    search: string,
    searchOperator: string
  ): IParametronApi;
  setFilter(
    attribute: string,
    method: "match" | "eq" | "ne",
    value: string | number | boolean
  ): IParametronApi;
  setFilter(
    attribute: string,
    method: "in" | "not_in",
    values: Array<string | number> | string | number
  ): IParametronApi;
  setFilter(
    attribute: string,
    method: "range",
    start: number | string,
    end: number | string
  ): IParametronApi;
  setFilter(
    attribute: string,
    method: "gt",
    value: string | number
  ): IParametronApi;
  setFilter(attribute: string, method: "exist" | "not_exist"): IParametronApi;
  setFixedOrder(ids: number[]): IParametronApi;
  dropFilters(attribute?: string, method?: string): IParametronApi;

  setPersistentFilter(
    attribute: "_",
    method: "q",
    search: string,
    searchOperator: string
  ): IParametronApi;
  setPersistentFilter(
    attribute: string,
    method: "match" | "eq" | "ne",
    value: string | number | boolean
  ): IParametronApi;
  setPersistentFilter(
    attribute: string,
    method: "in" | "not_in",
    values: Array<string | number> | string | number
  ): IParametronApi;
  setPersistentFilter(
    attribute: string,
    method: "range",
    start: number | string,
    end: number | string
  ): IParametronApi;
  setPersistentFilter(
    attribute: string,
    method: "exist" | "not_exist"
  ): IParametronApi;
  setPersistentFilter(
    attribute: string,
    method: "gt",
    value: string | number
  ): IParametronApi;
  setParams(params: any): IParametronApi;
  dropParams(...keys: string[]): IParametronApi;

  fire(): Promise<IParametronData>;

  pristine(): boolean;
}

export interface IParametron {
  readonly data: IParametronData;
  api: IParametronApi;
  opts?: IParametronOpts;
}

const apiFunctions = [
  "setFilter",
  "dropFilters",
  "setParams",
  "setFixedOrder",
  "dropParams",
  "setPersistentFilter",
];

const apiFunctionsWithReturn = [
  "getAggregations",
  "getFilters",
  "getFilterValues",
  "pristine",
];

// ---------- small helpers (replacing lodash) ----------

const noop = () => {};

const isPlainObject = (value: any): boolean => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * recursively merges plain objects into `target` (mutates and returns it)
 * - `undefined` values are skipped, `null` overwrites
 * - arrays and primitives are replaced (arrays are copied)
 */
function deepMerge(target: any, ...sources: any[]) {
  for (const source of sources) {
    if (!source) continue;

    for (const key of Object.keys(source)) {
      if (key === "__proto__") continue;
      const value = source[key];
      if (value === undefined) continue;

      if (isPlainObject(value)) {
        const base = isPlainObject(target[key]) ? target[key] : {};
        target[key] = deepMerge(base, value);
      } else if (Array.isArray(value)) {
        target[key] = [...value];
      } else {
        target[key] = value;
      }
    }
  }

  return target;
}

function readQueryState() {
  return queryString.parse(location.search, {
    parseNumbers: true,
    parseBooleans: true,
  });
}

export function createParametron(opts: IParametronOpts): IParametron {
  const update = opts?.update ?? noop;
  const init = opts?.init ?? noop;

  const instance = new Parametron(opts);

  const query = readQueryState();
  if (query.p) {
    const state = instance.deserialize(query.p as string);

    if (state.params) {
      instance.data.params = { ...instance.data.params, ...state.params };
    }
    if (state.filters) instance.data.filters = state.filters;
    if (state.persistentFilters) {
      instance.data.persistentFilters = state.persistentFilters;
    }
  }

  const api = {} as IParametronApi;

  apiFunctions.forEach((fn) => {
    api[fn] = (...args) => {
      instance[fn].apply(instance, args);
      return api;
    };
  });

  apiFunctionsWithReturn.forEach((fn) => {
    api[fn] = (...args) => {
      return instance[fn].apply(instance, args);
    };
  });

  api.fire = () => {
    // triggers an update before firing that indicates already parametron is running from now on
    instance.prepare();
    update(instance.data);

    return instance
      .fire()
      .then(() => {
        if (opts.serializeToURL && history.replaceState) {
          const query = readQueryState();
          query.p = instance.serialize();
          var newurl =
            location.protocol +
            "//" +
            location.host +
            location.pathname +
            "?" +
            queryString.stringify(query);
          history.replaceState({ path: newurl }, "", newurl);
        }
        update(instance.data);
        return instance.data;
      })
      .catch((err) => {
        if (err?.message === "AbortedExecution") {
          // if this execution was aborted, do not call the update callback
          // but return with current data instead
          return instance.data;
        }
        throw err;
      });
  };

  init(instance);

  return {
    data: instance.data,
    opts: instance.opts,
    api,
  };
}

const filterByAttributeMethod = (attribute?: string, method?: string) => {
  return (condition: any[]) => {
    const [attr, meth] = condition;

    if (attribute && method) return attribute === attr && method === meth;
    else if (attribute) return attribute === attr;
    else if (method) return method === meth;
    else return true;
  };
};

const createInitialData = (): IParametronData => ({
  reqId: 0,
  running: false,
  filters: [],
  persistentFilters: [],
  totalCount: 0,
  totalPages: 0,
  objects: [],
  aggregations: {},
  params: {
    page: 1,
    per: 24,
    sort: "created_at",
    order: "desc",
  },
});

const createEmptyResults = () => ({
  totalCount: 0,
  totalPages: 0,
  objects: [],
  aggregations: {},
});

export class Parametron {
  public data: IParametronData;
  public opts: IParametronOpts;
  private pactId = 0;
  private pact: Promise<any>;
  private fixedIdOrder: number[] = [];

  constructor(opts: IParametronOpts) {
    this.opts = { ...opts };
    this.data = createInitialData();
  }

  public serialize(): string {
    const data = {
      a: this.data.params,
      b: this.data.filters,
      c: this.data.persistentFilters,
    };
    return btoa(JSON.stringify(data));
  }

  public deserialize(input: string): Partial<IParametronData> {
    let data: any = {};

    try {
      data = JSON.parse(atob(input));
    } catch (e) {}

    const result: Partial<IParametronData> = {};
    if (data?.["a"]) result.params = data["a"];
    if (data?.["b"]) result.filters = data["b"];
    if (data?.["c"]) result.persistentFilters = data["c"];

    return result;
  }

  /*
   * returns aggregation values, i.e. available values (if available)
   * @param {string} attribute  the attribute to get values for
   */
  public getAggregations(attribute: string) {
    const aggregations = this.data.aggregations?.[`count_by_${attribute}`];
    return aggregations || [];
  }

  /*
   * clear filters
   * if no attribute nor method are provided: all filters are cleared
   * @param {string} [attribute] optional the attribute to clear filters for
   * @param {string} [method]    optional filter method (e.g. 'q', 'eq'...)
   */
  public dropFilters(attribute?: string, method?: string) {
    const matches = filterByAttributeMethod(attribute, method);
    const filters = this.data.filters;

    // remove in place, so references to the array stay valid
    for (let i = filters.length - 1; i >= 0; i--) {
      if (matches(filters[i])) filters.splice(i, 1);
    }

    this.data.params.page = 1;
  }

  /*
   * get current filters for..
   * @param {string} attribute  the attribute to get filters for
   * @param {string} [method]   optional filter method (e.g. 'q', 'eq'...)
   */
  public getFilters(attribute?: string, method?: string) {
    return this.data.filters.filter(filterByAttributeMethod(attribute, method));
  }

  /*
   * get current applied filter value for..
   * this is a helper method that returns the applied filter values of the FIRST filter that matches the criteria
   *    Example 1:
   *    getFilterValues('_', 'q')
   *    => 'Foo' // (the search string)
   *
   *    Example 2:
   *    getFilterValues('year_of_production', 'range')
   *    => [1900, 2008]
   * @param {string} attribute  the attribute to get filters for
   * @param {string} method     filter method (e.g. 'q', 'eq'...)
   */
  public getFilterValues(attribute: string, method: string) {
    const [candidate] = this.getFilters(attribute, method);
    const values = (candidate ?? []).slice(2); // omit attribute and method
    return values.length > 1 ? values : values[0];
  }

  /*
   * returns true if no filters have been applied (not taking into account persistent filters)
   */
  public pristine(): boolean {
    return this.getFilters().length === 0;
  }

  /*
   * add a new filter
   * @param {string}                                   attribute  the attribute to set filters for
   * @param {string}                                   method     filter method (e.g. 'q', 'eq'...)
   * @param {Array<string | number> | string | number} value1     filter value 1
   * @param {Array<string | number> | string | number} value2     filter value 2
   */
  public setFilter(attribute: string, method: string, value1?, value2?) {
    switch (method) {
      case "q":
        this.dropFilters("_");
        break;
      case "match":
        this.dropFilters(attribute, "match");
        break;
      case "eq":
      case "ne":
        this.dropFilters(attribute, "eq");
        this.dropFilters(attribute, "ne");
        break;
      case "range":
      case "in":
      case "not_in":
        this.dropFilters(attribute, "range");
        this.dropFilters(attribute, "in");
        this.dropFilters(attribute, "not_in");
        break;
      case "exist":
      case "not_exist":
        this.dropFilters(attribute, "exist");
        this.dropFilters(attribute, "not_exist");
        break;
      case "gt":
        this.dropFilters(attribute, "gt");
        break;
    }

    const condition = [attribute, method, value1, value2].filter(
      (value) => value !== null && value !== undefined
    );
    this.data.filters.push(condition);
    this.data.params.page = 1;
  }

  /*
   * add a new filter
   * like 'set', but adds a persistent filter that cannot be removed again
   */
  public setPersistentFilter(
    attribute: string,
    method: string,
    value1?,
    value2?
  ) {
    // note: drops all falsy values (0, false, "") - same as lodash `compact`
    this.data.persistentFilters.push(
      [attribute, method, value1, value2].filter(Boolean)
    );
  }

  /**
   * allow modifying params in any way you like
   */
  public setParams(params) {
    const newParams = deepMerge({}, this.data.params, params);

    // new ordering -> removes fixed id order again
    if (newParams.order || newParams.sort) {
      this.fixedIdOrder = [];
    }

    const cleaned = {};
    for (const key of Object.keys(newParams)) {
      const value = newParams[key];
      if (value !== null && value !== undefined) cleaned[key] = value;
    }

    this.data.params = cleaned;
    return this.data.params;
  }

  /**
   * this is a workaround to force returned objects to be in the given order of ids
   * see https://issues.mediafellows.com/issues/75758
   */
  public setFixedOrder(ids: number[]) {
    this.fixedIdOrder = ids;
    this.setParams({ sort: null, order: null, page: 1, per: 250 });
  }

  /**
   * helper to remove multiple params by name
   */
  public dropParams(...keys: string[]) {
    for (const key of keys) {
      delete this.data.params[key];
    }
  }

  // called before 'fire' to reset state
  public prepare() {
    const paging = {};
    for (const key of ["page", "per", "sort", "order"]) {
      if (key in this.data.params) paging[key] = this.data.params[key];
    }

    Object.assign(
      this.data,
      { running: true, reqId: this.data.reqId + 1 },
      paging,
      createEmptyResults()
    );
  }

  public fire(): Promise<IParametronData> {
    this.pactId++;
    const currentId = this.pactId;

    this.pact = new Promise((resolve, reject) => {
      const filters = this.data.persistentFilters.concat(this.data.filters);
      const body = deepMerge({}, this.data.params, {
        search: { filters },
        stats: this.opts.stats,
      });

      const { schema } = this.opts;
      const { params } = this.data;

      this.opts
        .executor({ body, params, schema })
        .then((result) => {
          // in case another request has been fired meanwhile, this one should fail
          if (currentId !== this.pactId) {
            return reject(new Error("AbortedExecution"));
          }

          let objects = result.objects;

          if (this.fixedIdOrder.length > 0) {
            const position = (x) => this.fixedIdOrder.indexOf(x.id);
            objects = [...objects].sort((a, b) => position(a) - position(b));
          }

          Object.assign(this.data, {
            running: false,
            objects: objects,
            aggregations: result.aggregations,
            totalCount: result.pagination?.total_count ?? 0,
            totalPages: result.pagination?.total_pages ?? 0,
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