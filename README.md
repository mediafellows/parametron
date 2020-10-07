# PARAMETRON

library providing a simple interface to set/update/remove filters (parametrize) on search requests

## usage

```javascript
import { createParametron, IParametronData, IParametronApi } from '@mediafellows/parametron';

const parametron = createParametron({
  executor: (opts) => chipmunk.action('pm.product', 'search', opts),
  schema: productListSchema,
  init: (api: IParametronApi) => {
    api.setParams({ only_roots: 'false' });
    api.setPersistentFilter('id', 'in', productIds);
  },
  update: (data: IParametronData) => {
    console.log('got data, see here', data);
  },
});
```

## options

```javascript
export interface IParametronOpts {
  executor: (opts: IActionOpts) => Promise<IResult>
  stats?: string
  schema?: string
  init?: (api: Parametron) => void
  update?: (data: IParametronData) => void
}
```

* `executor`: function that performs the request, result must implement the _chipmunk_ interface `IResult`
* `stats`: (optional) aggregation sets to be requested
* `schema`: (optional) schema to be resolved via chipmunk eventually, this isn't used by parametron itself, it's passed through to the _executor_ only
* `init`: (optional) function that receives the _api_ as an argument and can be used to setup initial parameters / filters
* `update`: (optional) function which is called with _data_ on any data change.

## api interface

```javascript
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
```

### getAggregations

returns aggregations (if requested, see Options#stats) by name

### getFilters

returns currently applied filters, optionally can be filtered by attribute name or search method

```javascript
// assuming we previously set these filters:
api.setFilter('access_level', 'exist')
api.setFilter('access_level', 'in', ['company', 'viewable'])

api.getFilters('access_level')
// => returns:
// [
//   ['access_level', 'exist'],
//   ['access_level', 'in', ['company', 'viewable']
// ]
```

### getFilterValues

returns only the values of the first matching currently applied filter

```javascript
// Example 1:
// api.getFilterValues('_', 'q')
// => 'Foo' // (the search string)
//
// Example 2:
// api.getFilterValues('year_of_production', 'range')
// => [1900, 2008]
```

### setFilter

supports these search methods:

* `q`
* `match`, `eq`, `ne`
* `in`, `not_in`
* `range`
* `exist`, `not_exist`

also see [mpx-core...filter/ops.rb](https://github.com/mediafellows/mpx-core/blob/master/search/lib/search/filter/ops.rb)

sets/updates a filter. clears existing filters on attribute / search method first. this also applies to _related_ search methods, i.e. a new `match` filter clears existing filters of type `match`, `eq` + `ne` for the same attribute.

### dropFilters

removes currently applied filters matching attribute / search method. <br>
removes all filters if no attribute / search method given.

### setPersistentFilter

sets/updates a _persistent_ filter. persistent filters cannot be dropped by design. this is useful for example to retain filters intact that are necessary for the context (e.g. filter by group id when displaying group products; filter by product id when querying for assets of a product), while still allowing the user to remove all optional current filters via `dropFilters`

### setParams

sets/updates additional params to be added to the request, like pagination params:

```
// e.g.
api.setParams({ per: 12, page: 3, sort: 'updated_at', order: 'desc' })
```

### dropParams

allows to drop certain params by name

```
// e.g.
api.dropParams('per', 'sort')
```

### fire

instructs parametron to start a request via the configured `executor` with the current filters / params.
returns a promise of type `Promise<IParametronData>`. also, the `update` callback is called with the same data on resolve, if configured.

### pristine

returns `true` if no filters are currently applied.
