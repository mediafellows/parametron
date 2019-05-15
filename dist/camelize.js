"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
// convert any object to camelized
const camelize = (data) => {
    if (lodash_1.isArray(data)) {
        return lodash_1.map(data, camelize);
    }
    else if (lodash_1.isPlainObject(data)) {
        const camelized = {};
        lodash_1.each(data, (value, key) => {
            key = lodash_1.startsWith(key, '@') ? `@${lodash_1.camelCase(key)}` : lodash_1.camelCase(key);
            camelized[key] = camelize(value);
        });
        return camelized;
    }
    return data;
};
exports.default = camelize;
