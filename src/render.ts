import { Props, VNode, VNodeChildren, isValidElement } from "./jsx";

/**
 * Output of rendering the child of a DOM VNode
 */
type ChildOutput = Component | Text | null;

/**
 * Data for a rendered component. This may be a DOM element or custom component.
 */
interface Component {
  // Depth of component from root. Used to sort components before a re-render
  depth: number;

  // VNode that was most recently rendered into this root.
  vnode: VNode;
  // VNode output from most recent render.
  output: ChildOutput[];

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

function flattenChildren(children: VNodeChildren): VNodeChild[] {
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

function getOutputDom(o: ChildOutput) {
  if (isText(o)) {
    return o;
  } else if (isComponent(o)) {
    return o.dom;
  } else {
    return null;
  }
}

/**
 * Return true if `child` does not render any output.
 */
function isNullChild(child: VNodeChild) {
  return child === null || typeof child === "boolean";
}

/**
 * Return true if `child` renders text.
 */
function isStringChild(child: VNodeChild) {
  return typeof child === "string" || typeof child === "number";
}

function isText(output: ChildOutput): output is Text {
  return output !== null && "wholeText" in output;
}

function isComponent(output: ChildOutput): output is Component {
  return output !== null && "vnode" in output;
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

  private _rootComponent: Component | null;
  private _document: Document;

  /**
   * Create a root using `domEl` as a container DOM element.
   */
  constructor(domEl: Element) {
    (domEl as UReactRootElement)._ureactRoot = this;

    this.element = domEl;
    this._rootComponent = null;
    this._document = domEl.ownerDocument;
  }

  /**
   * Render a VNode into the root.
   */
  render(vnode: VNode) {
    this._rootComponent = this._diff(this._rootComponent, vnode, this.element);
  }

  _diff(component: Component | null, vnode: VNode, parent: Element) {
    if (component?.vnode.type === vnode.type) {
      // Is this a DOM component?
      if (typeof vnode.type === "string") {
        const el = component.dom!;

        // Compare DOM properties, attributes and event listeners.
        diffElementProps(el, component.vnode.props, vnode.props);

        // Number of non-keyed children from the new vnode rendered so far.
        let nonKeyedCount = 0;

        // Components generated by rendering the new VNode.
        const newOutput = [];

        // Components generated by rendering the previous VNode.
        const prevOutput = component.output;

        // Components from previous render which have not been matched to a
        // child in the new render.
        const unmatchedOutput = new Set(prevOutput);

        // The DOM node associated with the last-rendered child from the new
        // vnode, excluding children don't render any output.
        let lastDomOutput;

        if (vnode.props.children) {
          for (let child of flattenChildren(vnode.props.children)) {
            // Find the child from the previous render that corresponds to this
            // child.
            let prevComponent;
            const childKey = isValidElement(child) ? child.key : null;
            if (childKey !== null) {
              prevComponent = prevOutput.find(
                (o) => isComponent(o) && o.vnode.key === childKey
              );
            } else {
              let nonKeyedIndex = -1;
              for (let i = 0; i < prevOutput.length; i++) {
                const o = prevOutput[i];
                const key = isComponent(o) ? o.vnode.key : null;
                if (key !== null) {
                  continue;
                }
                ++nonKeyedIndex;
                if (nonKeyedIndex === nonKeyedCount) {
                  prevComponent = o;
                  ++nonKeyedCount;
                  break;
                }
              }
            }

            // Did we find a matching component from the previous render that
            // we could update, instead of rendering a new element?
            let updatedPrevComponent = false;

            if (prevComponent !== undefined) {
              unmatchedOutput.delete(prevComponent);

              // Update the existing child component if one was found and it is
              // of the same type, or replace it otherwise.
              if (isNullChild(child) && prevComponent === null) {
                // Previous and next children generate no output.
                updatedPrevComponent = true;
              } else if (isStringChild(child) && isText(prevComponent)) {
                // Previous and next children are both text.
                prevComponent.data = child!.toString();
                lastDomOutput = prevComponent;
                updatedPrevComponent = true;
              } else if (
                isValidElement(child) &&
                isComponent(prevComponent) &&
                prevComponent.vnode.type === child.type
              ) {
                // Previous and next children are the same type of DOM or custom
                // component.
                this._diff(prevComponent, child, el);

                // If this is a keyed child, ensure it is located in the correct
                // position.
                if (childKey !== null) {
                  el.insertBefore(
                    prevComponent.dom!,
                    lastDomOutput ? lastDomOutput.nextSibling : el.firstChild
                  );
                }
                lastDomOutput = prevComponent.dom;
                updatedPrevComponent = true;
              }
            }

            if (!updatedPrevComponent) {
              if (prevComponent) {
                // Previous and next children are different types of component.
                this._unmount(prevComponent);
              }

              const childComponent = this._renderDomChild(
                component.depth,
                child
              );
              newOutput.push(childComponent);

              const childDom = getOutputDom(childComponent);
              if (childDom) {
                el.insertBefore(
                  childDom,
                  lastDomOutput ? lastDomOutput.nextSibling : el.firstChild
                );
              }
              lastDomOutput = childDom;
            }
          }
        }

        // Remove all the output from the previous render which was not matched
        // against output from the new render.
        for (let unmatched of unmatchedOutput) {
          if (unmatched) {
            this._unmount(unmatched);
          }
        }

        component.output = newOutput;
      } else if (typeof vnode.type === "function") {
        // Update custom component.
        const newOutput = vnode.type.call(null, vnode.props);
        const result = this._diff(
          // TODO - Handle components rendering non-vnode output.
          component.output[0] as Component,
          newOutput,
          parent
        );
        component.output[0] = result;
      }
      return component;
    } else {
      if (component) {
        this._unmount(component);
      }
      const newComponent = this._renderTree(component?.depth ?? 0, vnode);
      if (newComponent !== component && newComponent.dom) {
        parent.append(newComponent.dom);
      }
      return newComponent;
    }
  }

  /**
   * Render a child of a DOM component.
   */
  _renderDomChild(parentDepth: number, child: VNodeChild): ChildOutput {
    if (typeof child === "boolean" || child === null) {
      return null;
    }
    if (typeof child === "string" || typeof child === "number") {
      return this._createText(child.toString());
    } else if (!isValidElement(child)) {
      throw new Error("Object is not a valid element");
    } else {
      return this._renderTree(parentDepth, child as VNode);
    }
  }

  /**
   * Render a component tree beginning at `vnode`.
   */
  _renderTree(parentDepth: number, vnode: VNode): Component {
    const newComponent: Component = {
      depth: parentDepth + 1,
      vnode,
      output: [],
      dom: null,
    };

    if (typeof vnode.type === "string") {
      const el = this._createElement(vnode.type);
      diffElementProps(el, {}, vnode.props);
      newComponent.dom = el;

      if (vnode.props.children != null) {
        for (let child of flattenChildren(vnode.props.children)) {
          // TESTING
          console.log("children", vnode.props.children, "child", child);
          const childComponent = this._renderDomChild(
            newComponent.depth,
            child
          );
          newComponent.output.push(childComponent);
          const childDom = getOutputDom(childComponent);
          if (childDom) {
            el.append(childDom);
          }
        }
      }
    } else if (typeof vnode.type === "function") {
      const renderResult = vnode.type.call(null, vnode.props);
      const renderOutput = this._renderTree(newComponent.depth, renderResult);
      newComponent.output.push(renderOutput);

      const childDom = getOutputDom(renderOutput);
      newComponent.dom = childDom as Element | null;
    }

    return newComponent;
  }

  _createElement(type: string) {
    return this._document.createElement(type);
  }

  _createText(text: string) {
    return this._document.createTextNode(text);
  }

  _unmount(component: Component | Text) {
    if (isText(component)) {
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
