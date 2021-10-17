import {
  Props,
  Ref,
  VNodeChild,
  VNodeChildren,
  flattenChildren,
  isEmptyVNode,
} from "./jsx.js";
import { shallowEqual } from "./diff-utils.js";
import { useMemo, useRef } from "./hooks.js";

export function createRef<T>(): Ref<T | null> {
  return { current: null };
}

export function memo(component: (p: Props) => VNodeChildren) {
  const wrapper = (props: Props) => {
    const prevProps = useRef(props);
    if (prevProps.current !== props) {
      if (!shallowEqual(prevProps.current, props)) {
        prevProps.current = props;
      }
    }

    const result = useMemo(
      () => component(prevProps.current),
      [prevProps.current]
    );
    return result;
  };
  wrapper.displayName = `memo(${component.name})`;
  return wrapper;
}

export function toChildArray(children: VNodeChildren): VNodeChild[] {
  return flattenChildren(children).filter((c) => !isEmptyVNode(c));
}
