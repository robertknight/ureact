/**
 * Shallowly compare two objects for equality.
 */
export function shallowEqual(a: any, b: any) {
  for (let key in a) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  for (let key in b) {
    if (!(key in a)) {
      return false;
    }
  }
  return true;
}

/**
 * Return true if two arrays are shallow-equal.
 */
export function arraysEqual<T>(a: T[], b: T[]) {
  return a.length === b.length && a.every((v, i) => b[i] === v);
}
