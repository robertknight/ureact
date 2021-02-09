import { NodeType, Props, VNodeKey, elementSymbol } from "./jsx.js";

export { Fragment } from "./jsx.js";

/**
 * Create a VNode.
 *
 * This is used by the "new" JSX transform in production builds. See
 * https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html and
 * https://github.com/reactjs/rfcs/pull/107.
 */
export function jsx(type: NodeType, props: Props, key: VNodeKey | null = null) {
  return {
    $$typeof: elementSymbol,

    type,
    props,
    key,
  };
}

/**
 * Create a static VNode
 */
export { jsx as jsxs };
