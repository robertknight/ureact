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

// Element produced by a component describing what to render.
export interface VNode {
  type: NodeType;
  props: Props;
  key: VNodeKey | null;
}

export const elementSymbol = Symbol.for("ureactElement");

/**
 * Create a VNode.
 *
 * This is used by the "new" JSX transform. See
 * https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html.
 */
export function jsx(type: NodeType, props: Props, key?: VNodeKey | null) {
  return {
    // `_tag` is a non-serializable property used to indicate that the object was
    // created by the `jsx` or `createElement` functions. This prevents objects
    // from other sources accidentally being used as VNodes.
    _tag: elementSymbol,

    type,
    props,
    key,
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
  let key = props.key ?? null;

  // Here we assume it is safe to mutate `props`.
  if (key !== null) {
    delete props.key;
  }
  if (children.length > 0) {
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
