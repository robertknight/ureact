import { Props, VNode } from "./jsx";

// Internal data structure holding data for most recent render of a VNode into
// a diff.
interface Component {
  // Depth of component from root. Used to sort components before a re-render
  depth: number;

  // VNode that was most recently rendered into this root.
  vnode: VNode;
  // VNode output from most recent render.
  output: VNode;

  // DOM element produced by rendering this node.
  dom: Element | null;
}

// Properties added by existing DOM elements into which a UReact component tree
// is rendered.
interface UReactRootElement extends Element {
  _ureactRoot?: Root;
}

// Properties added to DOM elements rendered by UReact.
interface UReactElement extends Element {
  _ureactListeners?: { [event: string]: Function | null };
}

function isEventListener(prop: string) {
  return prop.startsWith("on");
}

function flatten<T>(items: T[]) {
  if (items.every((it) => !Array.isArray(it))) {
    return items;
  }
  return items.flat();
}

/**
 * Create or update an event listener on a DOM element.
 */
function setEventListener(node: Element, prop: string, value: null) {
  const ureactEl = node as UReactElement;
  const listeners =
    ureactEl._ureactListeners || (ureactEl._ureactListeners = {});

  let eventName = prop.slice(2);

  // Use a heuristic to test if this is a native DOM event, in which case
  // it uses a lower-case name.
  const nameLower = eventName.toLowerCase();
  if (nameLower in node) {
    eventName = nameLower;
  }

  if (!listeners[eventName]) {
    node.addEventListener(eventName, (event) => listeners[eventName]?.(event));
  }
  listeners[eventName] = value;
}

/**
 * Update the DOM property, attribute or event listener corresponding to
 * `prop`.
 */
function setProperty(node: Element, prop: string, value: any) {
  if (isEventListener(prop)) {
    setEventListener(node, prop, value);
    return;
  }

  if (prop in node) {
    (node as any)[prop] = value;
  } else {
    node.setAttribute(prop, value);
  }
}

/**
 * Update the DOM properties, attributes and event listeners of `node` to match
 * a new VDOM node.
 */
function diffElementProps(node: Element, oldProps: Props, newProps: Props) {
  for (let prop in newProps) {
    if (prop !== "children") {
      setProperty(node, prop, newProps[prop]);
    }
  }
}

/**
 * Render tree root.
 *
 * There is one `Root` per DOM subtree rendered by UReact. It is created
 * automatically when `render` is called with a given DOM element container
 * for the first time.
 */
class Root {
  element: Element;

  private rootComponent: Component | null;

  /**
   * Create a root using `domEl` as a container DOM element.
   */
  constructor(domEl: Element) {
    (domEl as UReactRootElement)._ureactRoot = this;

    this.element = domEl;
    this.rootComponent = null;
  }

  /**
   * Render a VNode into the root.
   */
  render(vnode: VNode) {
    this._diff(this.rootComponent, vnode, this.element);
  }

  _diff(component: Component | null, vnode: VNode, parent: Element) {
    const newComponent: Component = {
      depth: component !== null ? component.depth + 1 : 0,
      vnode: vnode,
      output: vnode,
      dom: null,
    };

    this.rootComponent = newComponent;

    if (typeof vnode.type === "string") {
      const el = parent.ownerDocument.createElement(vnode.type);
      diffElementProps(el, {}, vnode.props);
      newComponent.dom = el;
      parent.appendChild(el);

      if (vnode.props.children != null) {
        for (let child of flatten(vnode.props.children)) {
          if (typeof child === "boolean" || child === null) {
            continue;
          }

          if (typeof child === "string" || typeof child === "number") {
            el.append(child.toString());
          } else {
            this._diff(null, child as VNode, el);
          }
        }
      }
    }
  }
}

/**
 * Render a VNode into a DOM element
 *
 * See https://reactjs.org/docs/react-dom.html#render.
 */
export function render(vnode: VNode, container: Element) {
  const root =
    (container as UReactRootElement)._ureactRoot ?? new Root(container);
  root.render(vnode);
}
