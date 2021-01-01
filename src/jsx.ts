export type NodeType = string | Function;
export type VNodeKey = string | number;
export type VNodeChildren =
  | VNode
  | string
  | number
  | boolean
  | null
  | VNodeChildren[];

export interface Props {
  children?: VNodeChildren;
  key?: VNodeKey;
  [prop: string]: any;
}

export interface Ref<T> {
  current: T;
}

// Element produced by a component describing what to render.
export interface VNode {
  type: NodeType;
  props: Props;
  key: VNodeKey | null;
  ref: Ref<any> | null;
}

export const elementSymbol = Symbol.for("ureactElement");

/**
 * Create a VNode.
 *
 * This is used by the "new" JSX transform. See
 * https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html.
 */
export function jsx(type: NodeType, props: Props, key?: VNodeKey | null) {
  // nb. Here we assume it is safe to mutate `props`.
  const ref = props.ref ?? null;
  if (ref !== null) {
    delete props.ref;
  }

  return {
    // `_tag` is a non-serializable property used to indicate that the object was
    // created by the `jsx` or `createElement` functions. This prevents objects
    // from other sources accidentally being used as VNodes.
    _tag: elementSymbol,

    type,
    props,
    key,
    ref,
  };
}

/**
 * Create a VNode.
 *
 * This is used by the "old" JSX transform.
 *
 * See https://reactjs.org/docs/react-api.html#createelement.
 */
export function createElement(
  type: NodeType,
  props: Props = {},
  ...children: VNodeChildren[]
) {
  // nb. Here we assume it is safe to mutate `props`.
  const key = props.key ?? null;
  if (key !== null) {
    delete props.key;
  }

  // For consistency with `React.createElement`, if only 3 arguments are passed
  // then `children` is the value of the third argument.
  if (children.length === 1) {
    props.children = arguments[2];
  } else if (children.length > 0) {
    props.children = children;
  }

  return jsx(type, props, key);
}

/**
 * Return true if `obj` was created by `createElement` or `jsx`.
 *
 * See https://reactjs.org/docs/react-api.html#isvalidelement.
 */
export function isValidElement(obj: any): obj is VNode {
  return obj != null && obj._tag === elementSymbol;
}
