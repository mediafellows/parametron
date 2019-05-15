import {map, each, isArray, isPlainObject, camelCase, startsWith} from 'lodash'

// convert any object to camelized
const camelize = (data) => {
  if (isArray(data)) {
    return map(data, camelize)
  }
  else if (isPlainObject(data)) {
    const camelized = {}
    each(data, (value, key) => {
      key = startsWith(key, '@') ? `@${camelCase(key)}` : camelCase(key)
      camelized[key] = camelize(value)
    })
    return camelized
  }

  return data
}

export default camelize
