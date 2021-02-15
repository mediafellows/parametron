import {cloneDeep, pickBy, pick, get, isNull, isUndefined, compact, noop, isEmpty, merge, extend, remove, filter, each, first, slice} from 'lodash'
import {IResult, IActionOpts} from '@mediafellows/chipmunk'

export interface IParametronOpts {
  executor: (opts: IActionOpts) => Promise<IResult>
  stats?: string
  schema?: string
  init?: (api: Parametron) => void
  update?: (data: IParametronData) => void
}

export interface IParametronData {
  // internals
  reqId: number
  running: boolean

  // state
  params: { [s: string]: any }
  filters?: any[][]
  persistentFilters?: any[][]

  // results
  totalCount: number
  totalPages: number
  objects?: any[]
  aggregations?: any
}

export interface IParametronApi {
  getAggregations(attribute: string): any[]
  getFilters(attribute?: string, method?: string): any
  getFilterValues(attribute: string, method: string): any

  setFilter(attribute: '_', method: 'q', search: string): IParametronApi
  setFilter(attribute: string, method: 'match' | 'eq' | 'ne', value: string | number | boolean): IParametronApi
  setFilter(attribute: string, method: 'in' | 'not_in', values: Array<string | number> | string | number): IParametronApi
  setFilter(attribute: string, method: 'range', start: number | string, end: number| string): IParametronApi
  setFilter(attribute: string, method: 'exist' | 'not_exist'): IParametronApi
  dropFilters(attribute?: string, method?: string): IParametronApi

  setPersistentFilter(attribute: '_', method: 'q', search: string): IParametronApi
  setPersistentFilter(attribute: string, method: 'match' | 'eq' | 'ne', value: string | number | boolean): IParametronApi
  setPersistentFilter(attribute: string, method: 'in' | 'not_in', values: Array<string | number> | string | number): IParametronApi
  setPersistentFilter(attribute: string, method: 'range', start: number | string, end: number| string): IParametronApi
  setPersistentFilter(attribute: string, method: 'exist' | 'not_exist'): IParametronApi

  setParams(params: any): IParametronApi
  dropParams(...keys: string[]): IParametronApi

  fire(): Promise<IParametronData>

  pristine(): boolean
}

export interface IParametron {
  readonly data: IParametronData
  api: IParametronApi
  opts?: IParametronOpts
}

const apiFunctions= [
  'getAggregations',
  'setFilter',
  'dropFilters',
  'setParams',
  'dropParams',
  'setPersistentFilter',
]

const apiFunctionsWithReturn = [
  'getFilters',
  'getFilterValues',
  'pristine'
]

export function createParametron(opts: IParametronOpts): IParametron {
  const update    = get(opts, 'update', noop)
  const init      = get(opts, 'init', noop)

  const instance = new Parametron(opts)

  const api = {} as IParametronApi

  each(apiFunctions, (fn) => {
    api[fn] = (...args) => {
      instance[fn].apply(instance, args)
      return api
    }
  })

  each(apiFunctionsWithReturn, (fn) => {
    api[fn] = (...args) => {
      return instance[fn].apply(instance, args)
    }
  })

  api.fire = () => {
    // triggers an update before firing that indicates already parametron is running from now on
    instance.prepare()
    update(instance.data)

    return instance.fire().then(() => {
      update(instance.data)
      return instance.data
    })
  }

  if (init) {
    init(instance)
  }

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

  constructor(opts: IParametronOpts) {
    this.opts = cloneDeep(opts)
    this.data = cloneDeep({...initialData, ...emptyResults, params: initialParams })
  }

  /*
   * returns aggregation values, i.e. available values (if available)
   * @param {string} attribute  the attribute to get values for
   */
  public getAggregations(attribute: string) {
    const aggregations = get(this.data, `aggregations.count_by_${attribute}`)
    return aggregations || []
  }

  /*
   * clear filters
   * if no attribute nor method are provided: all filters are cleared
   * @param {string} [attribute] optional the attribute to clear filters for
   * @param {string} [method]    optional filter method (e.g. 'q', 'eq'...)
   */
  public dropFilters(attribute?: string, method?: string) {
    remove(this.data.filters, filterByAttributeMethod(attribute, method))
  }

  /*
   * get current filters for..
   * @param {string} attribute  the attribute to get filters for
   * @param {string} [method]   optional filter method (e.g. 'q', 'eq'...)
   */
  public getFilters(attribute?: string, method?: string) {
    return filter(this.data.filters, filterByAttributeMethod(attribute, method))
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
    const applied   = filter(this.data.filters, filterByAttributeMethod(attribute, method))
    const candidate = first(applied)
    const values    = slice(candidate, 2) // omit attribute and method
    return values.length > 1 ? values : first(values)
  }

  /*
   * returns true if no filters have been applied (not taking into account persistent filters)
   */
  public pristine(): boolean {
    return isEmpty(this.getFilters())
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
      case 'q':
        this.dropFilters('_')
        break
      case 'match':
        this.dropFilters(attribute, 'match')
        break
      case 'eq':
      case 'ne':
        this.dropFilters(attribute, 'eq')
        this.dropFilters(attribute, 'ne')
        break
      case 'range':
      case 'in':
      case 'not_in':
        this.dropFilters(attribute, 'range')
        this.dropFilters(attribute, 'in')
        this.dropFilters(attribute, 'not_in')
        break
      case 'exist':
      case 'not_exist':
        this.dropFilters(attribute, 'exist')
        this.dropFilters(attribute, 'not_exist')
        break
    }

    const condition = filter([attribute, method, value1, value2], (value) => !isNull(value) && !isUndefined(value))
    this.data.filters.push(condition)
    this.data.params.page = 1
  }

  /*
   * add a new filter
   * like 'set', but adds a persistent filter that cannot be removed again
   */
  public setPersistentFilter(attribute: string, method: string, value1?, value2?) {
    this.data.persistentFilters.push(compact([attribute, method, value1, value2]))
  }

  /**
   * allow modifying params in any way you like
   */
  public setParams(params) {
    const newParams = merge({}, this.data.params, params)
    this.data.params = pickBy(newParams, (value) => !isNull(value) && !isUndefined(value))
    return this.data.params
  }

  /**
   * helper to remove multiple params by name
   */
  public dropParams(...keys) {
    for (let key in keys) {
      delete this.data.params[key]
    }
  }

  // called before 'fire' to reset state
  public prepare() {
    extend(
      this.data,
      { running: true, reqId: this.data.reqId + 1 },
      pick(this.data.params, 'page', 'per', 'sort', 'order'),
      emptyResults,
    )
  }

  public fire(): Promise<IParametronData> {
    this.pact = new Promise((resolve, reject) => {
      const filters = this.data.persistentFilters.concat(this.data.filters)
      const body = merge({}, this.data.params, {
        search: { filters },
        stats: this.opts.stats,
      })

      const { schema } = this.opts
      const { params } = this.data

      this.opts.executor({ body, params, schema }).then((result) => {
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
