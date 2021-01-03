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
