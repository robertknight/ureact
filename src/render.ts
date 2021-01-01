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
  vnode: VNodeChild;
  // VNode output from most recent render.
  output: ChildOutput[];

  // DOM node produced by rendering `vnode`.
  dom: Element | Text | null;
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

/**
 * Value which can be returned from a custom component as the result to render
 * or passed to `render`.
 *
 * These fall into several categories:
 *
 *  - Values which render nothing (null, boolean)
 *  - Values which render text
 *  - Values which render a DOM element
 *  - Values which render a custom component
 */
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
 * Return true if `vnode` does not render any output.
 */
function isEmptyVNode(vnode: VNodeChild): vnode is null | boolean {
  return vnode === null || typeof vnode === "boolean";
}

/**
 * Return true if `vnode` renders text.
 */
function isTextVNode(vnode: VNodeChild): vnode is string | number {
  return typeof vnode === "string" || typeof vnode === "number";
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
  render(vnode: VNodeChild) {
    this._rootComponent = this._diff(this._rootComponent, vnode, this.element);
  }

  _diff(component: Component | null, vnode: VNodeChild, parent: Element) {
    // Did we successfully update the existing component instance?
    let didUpdate = false;

    if (component) {
      const prevVnode = component.vnode;

      if (isTextVNode(prevVnode) && isTextVNode(vnode)) {
        if (vnode !== prevVnode) {
          (component.dom as Text).data = vnode.toString();
        }
        didUpdate = true;
      } else if (isEmptyVNode(prevVnode) && isEmptyVNode(vnode)) {
        didUpdate = true;
      } else if (
        isValidElement(prevVnode) &&
        isValidElement(vnode) &&
        prevVnode.type === vnode.type
      ) {
        if (typeof vnode.type === "string") {
          // Update DOM component.
          const el = component.dom as Element;
          diffElementProps(el, prevVnode.props, vnode.props);
          component.output = this._diffChildren(component, vnode, el);
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
        didUpdate = true;
      }
    }

    if (didUpdate) {
      component!.vnode = vnode;
      return component;
    }

    if (component) {
      this._unmount(component);
    }
    const newComponent = this._renderTree(component?.depth ?? 0, vnode);
    if (newComponent !== component && newComponent.dom) {
      parent.append(newComponent.dom);
    }
    return newComponent;
  }

  _diffChildren(component: Component, vnode: VNode, el: Element) {
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
            (o) =>
              isComponent(o) &&
              isValidElement(o.vnode) &&
              o.vnode.key === childKey
          );
        } else {
          let nonKeyedIndex = -1;
          for (let i = 0; i < prevOutput.length; i++) {
            const o = prevOutput[i];
            const key =
              isComponent(o) && isValidElement(o.vnode) ? o.vnode.key : null;
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
          if (isEmptyVNode(child) && prevComponent === null) {
            // Previous and next children generate no output.
            updatedPrevComponent = true;
          } else if (isTextVNode(child) && isText(prevComponent)) {
            // Previous and next children are both text.
            prevComponent.data = child!.toString();
            lastDomOutput = prevComponent;
            updatedPrevComponent = true;
          } else if (
            isValidElement(child) &&
            isComponent(prevComponent) &&
            isValidElement(prevComponent.vnode) &&
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

          const childComponent = this._renderDomChild(component.depth, child);
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

    return newOutput;
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
  _renderTree(parentDepth: number, vnode: VNodeChild): Component {
    const newComponent: Component = {
      depth: parentDepth + 1,
      vnode,
      output: [],
      dom: null,
    };

    if (isEmptyVNode(vnode)) {
      newComponent.output.push(null);
    } else if (isTextVNode(vnode)) {
      const text = this._createText(vnode.toString());
      newComponent.output.push(text);
      newComponent.dom = text;
    } else if (typeof vnode.type === "string") {
      const el = this._createElement(vnode.type);
      diffElementProps(el, {}, vnode.props);
      newComponent.dom = el;

      if (vnode.props.children != null) {
        for (let child of flattenChildren(vnode.props.children)) {
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
export function render(vnode: VNodeChild, container: Element) {
  const root =
    (container as UReactRootElement)._ureactRoot ?? new Root(container);
  root.render(vnode);
}
