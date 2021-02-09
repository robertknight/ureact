import { NodeType, Props, VNodeKey, elementSymbol } from "./jsx.js";

export { Fragment } from "./jsx.js";

export interface SourceLocation {
  fileName: string;
  columnNumber: number;
  lineNumber: number;
}

/**
 * Create a VNode.
 *
 * This is used by the "new" JSX transform in development builds. See
 * https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html and
 * https://github.com/reactjs/rfcs/pull/107.
 */
export function jsxDEV(
  type: NodeType,
  props: Props,
  key: VNodeKey | undefined,
  isStaticChildren: boolean,
  source: SourceLocation,
  self: any
) {
  // Suppress warning about unused parameter.
  isStaticChildren = isStaticChildren;

  return {
    $$typeof: elementSymbol,

    type,
    props,
    key,

    // Debug properties
    source,
    self,
  };
}
