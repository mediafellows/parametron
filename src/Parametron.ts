import {cloneDeep, pickBy, pick, get, isNull, isUndefined, compact, noop, isEmpty, merge, extend, remove, filter, each, first, slice} from 'lodash'
import Promise from 'bluebird'
import {IChipmunk} from '@mediafellows/chipmunk'

// enable promise cancelling
Promise.config({ cancellation: true })

export interface IParametronOpts {
  model: 'pm.product' | 'am.asset'
  stats?: string
  schema: string
  immediate?: boolean
  action?: string
  params?: any
  init?: (api: Parametron) => void
  update?: (data: IParametronData) => void
}

export interface IParametronData {
  page: number
  per: number
  sort: string
  order: string
  totalCount: number
  totalPages: number
  running: boolean
  filters?: any[][]
  persistentFilters?: any[][]
  objects?: any[]
  aggregations?: any
  stats?: string
  reqId?: number
}

export interface IParametronApi {
  clear(attribute?: string, method?: string): Promise<any>
  get(attribute?: string, method?: string): any
  getValues(attribute: string): any
  set(attribute: '_', method: 'q', search: string): Promise<any>
  set(attribute: string, method: 'match' | 'eq' | 'ne', value: string | number): Promise<any>
  set(attribute: string, method: 'in' | 'not_in', values: Array<string | number> | string | number): Promise<any>
  set(attribute: string, method: 'range', start: number, end: number): Promise<any>
  set(attribute: string, method: 'exist' | 'not_exist'): Promise<any>
  setPersistent(attribute: '_', method: 'q', search: string): Promise<any>
  setPersistent(attribute: string, method: 'match' | 'eq' | 'ne', value: string | number): Promise<any>
  setPersistent(attribute: string, method: 'in' | 'not_in', values: Array<string | number> | string | number): Promise<any>
  setPersistent(attribute: string, method: 'range', start: number, end: number)
  setPersistent(attribute: string, method: 'exist' | 'not_exist')
  put(attribute: '_', method: 'q', search: string): void
  put(attribute: string, method: 'match' | 'eq' | 'ne', value: string | number): void
  put(attribute: string, method: 'in' | 'not_in', values: Array<string | number> | string | number): void
  put(attribute: string, method: 'range', start: number, end: number): void
  put(attribute: string, method: 'exist' | 'not_exist'): void
  erase(attribute?: string, method?: string): void
  fire(): Promise<any>
  pristine(): boolean
  params(params: any): Promise<any>
  fetch(attribute: string, method: string): any
}

export interface IParametron {
  readonly data: IParametronData
  api: IParametronApi
  opts?: IParametronOpts
}

const apiFunctionsSync  = ['get', 'fetch', 'pristine', 'getValues', 'ready', 'loading']
const apiFunctionsAsync = ['clear', 'set', 'setPersistent', 'params']

export function createParametron(opts: IParametronOpts, chipmunk: IChipmunk): IParametron {
  const update    = get(opts, 'update', noop)
  const init      = get(opts, 'init', noop)
  const immediate = get(opts, 'immediate', true)

  const instance = new Parametron(opts, chipmunk)

  const api = {} as IParametronApi

  each(apiFunctionsSync,  (fn) => {
    api[fn] = (...args) => {
      return instance[fn].apply(instance, args)
    }
  })
  each(apiFunctionsAsync, (fn) => {
    api[fn] = (...args) => {
      instance[fn].apply(instance, args)
      return api.fire()
    }
  })
  api.fire = () => {
    // triggers an update before firing that indicates already parametron is running from now on
    instance.prepare()
    update(instance.data)

    return instance.fire().then(() => update(instance.data))
  }
  // like 'set' but doesn't fire immediately
  api.put = (...args) => {
    instance.set.apply(instance, args)
  }
  // like 'clear' but doesn't fire immediately
  api.erase = (...args) => {
    instance.clear.apply(instance, args)
  }

  if (init) init(instance)
  if (immediate) api.fire()

  return {
    data: instance.data,
    opts: instance.opts,
    api,
  }
}

const filterByAttributeMethod = (attribute?: string, method?: string) => {
  return (filter) => {
    const [attr, meth] = filter

    if (attribute && method) return attribute === attr && method === meth
    else if (attribute)      return attribute === attr
    else if (method)         return method === meth
    else                     return true
  }
}

const initialParams = {
  page: 1,
  per: 24,
  sort: 'created_at',
  order: 'desc',
}

const initialData = {
  reqId: 0,
  running: false,
  filters: [],
  persistentFilters: [],
}

const emptyResults = {
  totalCount: 0,
  totalPages: 0,
  objects: [],
  aggregations: {},
}

export class Parametron {
  public data: IParametronData
  public opts: IParametronOpts
  private pact: Promise<any>
  private chipmunk: IChipmunk

  constructor(opts: IParametronOpts, chipmunk: IChipmunk) {
    this.chipmunk = chipmunk
    this.opts = cloneDeep(merge({}, {params: initialParams}, opts))
    this.data = cloneDeep(merge({}, initialParams, initialData, emptyResults))

    if (isEmpty(this.opts.model)) throw new Error(`parametron: 'model' option missing`)
  }

  /*
   * returns aggregation values, i.e. available values (if available)
   * @param {string} attribute  the attribute to get values for
   */
  public getValues(attribute: string) {
    const aggregations = get(this.data, `aggregations.count_by_${attribute}`)
    return aggregations || []
  }

  /*
   * clear filters
   * if no attribute nor method are provided: all filters are cleared
   * @param {string} [attribute] optional the attribute to clear filters for
   * @param {string} [method]    optional filter method (e.g. 'q', 'eq'...)
   */
  public clear(attribute?: string, method?: string) {
    remove(this.data.filters, filterByAttributeMethod(attribute, method))
  }

  /*
   * get current filters for..
   * @param {string} attribute  the attribute to get filters for
   * @param {string} [method]   optional filter method (e.g. 'q', 'eq'...)
   */
  public get(attribute?: string, method?: string) {
    return filter(this.data.filters, filterByAttributeMethod(attribute, method))
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
  public fetch(attribute: string, method: string) {
    const applied   = filter(this.data.filters, filterByAttributeMethod(attribute, method))
    const candidate = first(applied)
    const values    = slice(candidate, 2) // omit attribute and method
    return values.length > 1 ? values : first(values)
  }

  /*
   * returns true if no filters have been applied (not taking into account persistent filters)
   */
  public pristine(): boolean {
    return isEmpty(this.get())
  }

  /*
   * add a new filter
   * @param {string}                                   attribute  the attribute to set filters for
   * @param {string}                                   method     filter method (e.g. 'q', 'eq'...)
   * @param {Array<string | number> | string | number} value1     filter value 1
   * @param {Array<string | number> | string | number} value2     filter value 2
   */
  public set(attribute: string, method: string, value1?, value2?) {
    switch (method) {
      case 'q':
        this.clear('_')
        break
      case 'match':
        this.clear(attribute, 'match')
        break
      case 'eq':
      case 'ne':
        this.clear(attribute, 'eq')
        this.clear(attribute, 'ne')
        break
      case 'range':
      case 'in':
      case 'not_in':
        this.clear(attribute, 'range')
        this.clear(attribute, 'in')
        this.clear(attribute, 'not_in')
        break
      case 'exist':
      case 'not_exist':
        this.clear(attribute, 'exist')
        this.clear(attribute, 'not_exist')
        break
    }

    const condition = filter([attribute, method, value1, value2], (value) => !isNull(value) && !isUndefined(value))
    this.data.filters.push(condition)
    this.opts.params.page = 1
  }

  /*
   * add a new filter
   * like 'set', but adds a persistent filter that cannot be removed again
   */
  public setPersistent(attribute: string, method: string, value1?, value2?) {
    this.data.persistentFilters.push(compact([attribute, method, value1, value2]))
  }

  /**
   * allow modifying params in any way you like
   */
  public params(params) {
    const newParams = merge({}, this.opts.params, params)
    this.opts.params = pickBy(newParams, (value) => !isNull(value) && !isUndefined(value))
    return this.opts.params
  }

  // might be called before 'fire' to reset state
  public prepare() {
    extend(
      this.data,
      { running: true, reqId: this.data.reqId + 1 },
      pick(this.opts.params, 'page', 'per', 'sort', 'order'),
      emptyResults,
    )
  }

  public fire(): Promise<IParametronData> {
    // cancel any pending request
    if (this.pact) this.pact.cancel()
    this.prepare()

    this.pact = new Promise((resolve, reject) => {
      const filters = this.data.persistentFilters.concat(this.data.filters)
      const body = merge({}, this.opts.params, {
        search: { filters },
        stats: this.opts.stats,
      })

      const {params, schema} = this.opts

      this.chipmunk.action(this.opts.model, this.opts.action || 'search', {
        body,
        params,
        schema,
      }).then((result) => {
        extend(this.data, {
          running: false,
          objects: result.objects,
          aggregations: result.aggregations,
          totalCount: get(result, 'pagination.total_count', 0),
          totalPages: get(result, 'pagination.total_pages', 0),
        })

        resolve(this.data)
      })
      .catch((err) => {
        this.data.running = false
        reject(err)
      })
    })

    return this.pact
  }
}
