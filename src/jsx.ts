type NodeType = string | Function;
type VNodeKey = string | number;
type VNodeChildren = VNode | VNode[];

export interface Props {
  children?: VNodeChildren;
  key?: VNodeKey;
  [prop: string]: any;
}

// Element produced by a component describing what to render.
export interface VNode {
  type: NodeType;
  props: { [name: string]: any };
  key: VNodeKey | null;
}

/**
 * Create a VNode.
 *
 * This is used by the "new" JSX transform. See
 * https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html.
 */
export function jsx(type: NodeType, props: Props, key?: VNodeKey | null) {
  return {
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
  ...children: VNode[]
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
