import { Props, Ref, VNodeChildren } from "./jsx.js";

import { useMemo, useRef } from "./hooks.js";

export function Fragment(props: Props) {
  return props.children;
}

export function createRef<T>(): Ref<T | null> {
  return { current: null };
}

/**
 * Shallowly compare two props objects for equality.
 */
function propsEqual(a: any, b: any) {
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

export function memo(component: (p: Props) => VNodeChildren) {
  const wrapper = (props: Props) => {
    const prevProps = useRef(props);
    if (prevProps.current !== props) {
      if (!propsEqual(prevProps.current, props)) {
        prevProps.current = props;
      }
    }

    const result = useMemo(() => component(prevProps.current), [
      prevProps.current,
    ]);
    return result;
  };
  wrapper.displayName = `memo(${component.name})`;
  return wrapper;
}
