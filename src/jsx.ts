export type NodeType = string | Function;
export type VNodeKey = string | number;

export type VNodeChild = string | boolean | number | null | undefined | VNode;
export type VNodeChildren = VNodeChild | VNodeChildren[];

export interface Props {
  children?: VNodeChildren;
  key?: VNodeKey;
  [prop: string]: any;
}

export interface Ref<T> {
  current: T;
}

/**
 * Element produced by `createElement` or JSX describing what to render.
 */
export interface VNode {
  $$typeof: Symbol;

  type: NodeType;
  props: Props;
  key: VNodeKey | null;

  source?: any;
  self?: any;
}

export function Fragment(props: Props) {
  return props.children;
}

/**
 * A non-serializable property added to JSX elements to indicate that the object was
 * created by the `jsx` or `createElement` functions. This prevents objects
 * from other sources accidentally being used as VNodes.
 */
export const elementSymbol = Symbol.for("react.element");

/**
 * Create a VNode.
 *
 * This is used by the "old" JSX transform.
 *
 * See https://reactjs.org/docs/react-api.html#createelement.
 */
export function createElement(
  type: NodeType,
  props?: Props,
  ...children: VNodeChildren[]
): VNode {
  let key = null;

  const normalizedProps = {} as Props;
  for (let prop in props) {
    const value = props[prop];
    if (prop === "key") {
      key = value;
    } else if (prop !== "__source" && prop !== "__self") {
      normalizedProps[prop] = props[prop];
    }
  }

  // For consistency with `React.createElement`, if only 3 arguments are passed
  // then `children` is the value of the third argument.
  if (children.length === 1) {
    normalizedProps.children = arguments[2];
  } else if (children.length > 0) {
    normalizedProps.children = children;
  }

  return {
    $$typeof: elementSymbol,

    type,
    props: normalizedProps,
    key,
  };
}

/**
 * Return true if `obj` was created by `createElement` or `jsx`.
 *
 * See https://reactjs.org/docs/react-api.html#isvalidelement.
 */
export function isValidElement(obj: any): obj is VNode {
  return obj != null && obj.$$typeof === elementSymbol;
}

export function flattenChildren(children: VNodeChildren): VNodeChild[] {
  if (!Array.isArray(children)) {
    return [children];
  }
  if (children.every((c) => !Array.isArray(c))) {
    return children as VNodeChild[];
  }
  const maxDepth = 256;
  return children.flat(maxDepth) as VNodeChild[];
}

/**
 * Return true if `vnode` does not render any output.
 */
export function isEmptyVNode(vnode: VNodeChild): vnode is null | boolean {
  return vnode == null || typeof vnode === "boolean";
}

/**
 * Return true if `vnode` renders text.
 */
export function isTextVNode(vnode: VNodeChild): vnode is string | number {
  return typeof vnode === "string" || typeof vnode === "number";
}
