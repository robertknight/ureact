import { Props, VNode, VNodeChildren, isValidElement } from "./jsx";

/**
 * Data for a rendered component. This may be a DOM element or custom component.
 */
interface Component {
  // Depth of component from root. Used to sort components before a re-render
  depth: number;

  // VNode that was most recently rendered into this root.
  vnode: VNode;
  // VNode output from most recent render.
  output: (Component | Text | null)[];

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

type VNodeChild = string | boolean | number | null | VNode;

function flatten(children: VNodeChildren): VNodeChild[] {
  if (!Array.isArray(children)) {
    return [children];
  }
  if (children.every((c) => !Array.isArray(c))) {
    return children as VNodeChild[];
  }
  return children.flat() as VNodeChild[];
}

/**
 * Create or update an event listener on a DOM element.
 */
function setEventListener(
  node: Element,
  prop: string,
  value: (e: Event) => any
) {
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

function unsetProperty(node: Element, prop: string) {
  if (isEventListener(prop)) {
    const noopListener = () => {};
    setEventListener(node, prop, noopListener);
  }

  if (prop in node) {
    (node as any)[prop] = "";
  } else {
    node.removeAttribute(prop);
  }
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
  for (let prop in oldProps) {
    if (prop !== "children" && !(prop in newProps)) {
      unsetProperty(node, prop);
    }
  }

  for (let prop in newProps) {
    if (prop !== "children") {
      setProperty(node, prop, newProps[prop]);
    }
  }
}

function getKey(node: any) {
  return node?.key ?? null;
}

function isNullChild(child: VNodeChild) {
  return child === null || typeof child === "boolean";
}

function isStringChild(child: VNodeChild) {
  return typeof child === "string" || typeof child === "number";
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
    this.rootComponent = this._diff(this.rootComponent, vnode, this.element);
  }

  _diff(component: Component | null, vnode: VNode, parent: Element) {
    if (component?.vnode.type === vnode.type) {
      // Is this a DOM component?
      if (typeof vnode.type === "string") {
        // Compare DOM properties, attributes and event listeners.
        diffElementProps(component.dom!, component.vnode.props, vnode.props);

        // Compare children.
        let nonKeyedCount = 0;
        const newOutput = [];
        const prevOutput = component.output;

        if (vnode.props.children) {
          for (let child of flatten(vnode.props.children)) {
            const childKey = getKey(child);
            let prevComponent;

            if (childKey !== null) {
              prevComponent = prevOutput.find((o) => getKey(o) === childKey);
            } else {
              let nonKeyedIndex = -1;
              for (let i = 0; i < prevOutput.length; i++) {
                const o = prevOutput[i];
                if (getKey(o) !== null) {
                  continue;
                }
                ++nonKeyedIndex;
                if (nonKeyedIndex === nonKeyedCount) {
                  prevComponent = o;
                  ++nonKeyedCount;
                }
              }
            }

            if (isNullChild(child) && prevComponent === null) {
              continue;
            } else if (
              isStringChild(child) &&
              prevComponent != null &&
              "wholeText" in prevComponent
            ) {
              prevComponent.data = child!.toString();
            } else if (
              isValidElement(child) &&
              prevComponent != null &&
              "vnode" in prevComponent &&
              prevComponent.vnode.type === child.type
            ) {
              this._diff(prevComponent, child, component.dom!);
            } else {
              if (prevComponent) {
                this._unmount(prevComponent);
              }
              if (isNullChild(child)) {
                newOutput.push(null);
              } else if (isStringChild(child)) {
                const text = component.dom!.append(child!.toString());
                newOutput.push(component.dom!.lastChild as Text);
              } else {
                newOutput.push(
                  this._renderNewTree(component, child as VNode, component.dom!)
                );
              }
            }

            // If the child has the same type as the matched component, update it.
            // Otherwise unmount the matched component and render the new one.
          }
        }

        // Unmount any existing children that were not matched to a new child.

        component.output = newOutput;
      }
      return component;
    } else {
      if (component) {
        this._unmount(component);
      }
      return this._renderNewTree(component, vnode, parent);
    }
  }

  _renderNewTree(
    parentComponent: Component | null,
    vnode: VNode,
    parent: Element
  ) {
    const newComponent: Component = {
      depth: (parentComponent?.depth ?? -1) + 1,
      vnode,
      output: [],
      dom: null,
    };

    if (typeof vnode.type === "string") {
      const el = parent.ownerDocument.createElement(vnode.type);
      diffElementProps(el, {}, vnode.props);
      newComponent.dom = el;

      if (vnode.props.children != null) {
        for (let child of flatten(vnode.props.children)) {
          if (typeof child === "boolean" || child === null) {
            newComponent.output.push(null);
            continue;
          }

          if (typeof child === "string" || typeof child === "number") {
            const childStr = child.toString();
            el.append(childStr);
            newComponent.output.push(el.lastChild as Text);
          } else if (!isValidElement(child)) {
            throw new Error("Object is not a valid element");
          } else {
            const component = this._renderNewTree(
              newComponent,
              child as VNode,
              el
            );
            newComponent.output.push(component);
          }
        }
      }

      // Append the new DOM subtree to the parent element after the subtree
      // is fully constructed.
      parent.appendChild(el);
    }

    return newComponent;
  }

  _unmount(component: Component | Text) {
    if ("wholeText" in component) {
      component.remove();
    } else {
      component.dom?.remove();
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
