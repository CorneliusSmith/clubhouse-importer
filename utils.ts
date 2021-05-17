/* Utility to do a deep resolution of a nested object key */
export function _resolve(path: string | string[], obj: any, separator = '.') {
  var properties = Array.isArray(path) ? path : path.split(separator);
  return properties.reduce((prev, curr) => prev && prev[curr], obj);
}

/* Utility to remove null and undefined values from an object */
export function _cleanObj(obj: any) {
  const propNames = Object.getOwnPropertyNames(obj);
  for (let i = 0; i < propNames.length; i++) {
    const propName = propNames[i];
    if (obj[propName] === null || obj[propName] === undefined) {
      delete obj[propName];
    }
  }
  return obj;
}
