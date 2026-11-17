
type QueryValue = string | number | boolean | null | undefined;
type QueryObject = Record<string, QueryValue | QueryValue[]>;

interface ParseOptions {
  parseNumbers?: boolean;
  parseBooleans?: boolean;
}

function convertValue(value: string, options: ParseOptions): string | number | boolean {
  if (options.parseBooleans) {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  if (options.parseNumbers && value.trim() !== '') {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return value;
}

export function parse(
  search: string,
  options: ParseOptions = {},
): Record<string, string | number | boolean | (string | number | boolean)[]> {
  const params = new URLSearchParams(search);
  const result: Record<string, any> = {};

  params.forEach((value, key) => {
    const parsedValue = convertValue(value, options);

    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (Array.isArray(result[key])) {
        result[key].push(parsedValue);
      } else {
        result[key] = [result[key], parsedValue];
      }
    } else {
      result[key] = parsedValue;
    }
  });

  return result;
}

export function stringify(query: QueryObject): string {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    const values = Array.isArray(value) ? value : [value];

    values.forEach((item) => {
      if (item !== null && item !== undefined) {
        params.append(key, String(item));
      }
    });
  });

  return params.toString();
}
