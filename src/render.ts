import { Props, VNode, VNodeChildren, isValidElement } from "./jsx";
import { HookState, setHookState } from "./hooks";

/**
 * Backing tree for a rendered vnode.
 */
interface Component {
  parent: Component | null;
  depth: number;

  /** The vnode that produced this component. */
  vnode: VNodeChild;

  /**
   * For DOM components, the child components generated by rendering the DOM vnode's
   * children.
   *
   * For custom components, the child components generated by rendering the
   * component's output.
   *
   * For empty or text components this is not used.
   */
  output: Component[];

  /**
   * DOM node produced by rendering `vnode`.
   */
  dom: Element | Text | null;

  hooks: HookState | null;
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

function vnodeKey(vnode: any) {
  return isValidElement(vnode) ? vnode.key : null;
}

/**
 * Return the top-level DOM nodes rendered by a component.
 */
function topLevelDomNodes(c: Component): (Element | Text)[] {
  if (c.dom) {
    return [c.dom];
  }
  return c.output.flatMap(topLevelDomNodes);
}

function getParentDom(c: Component) {
  let parent = c.parent;
  while (parent && !parent.dom) {
    parent = parent.parent;
  }
  return parent ? parent.dom : null;
}

function isAncestorOf(ancestor: Component, c: Component | null) {
  while (c && c !== ancestor) {
    c = c.parent;
  }
  return c === ancestor;
}

/**
 * Render tree root.
 *
 * There is one `Root` per DOM subtree rendered by UReact. It is created
 * automatically when `render` is called with a given DOM element container
 * for the first time.
 */
class Root {
  container: Element;

  private _rootComponent: Component | null;
  private _document: Document;
  private _pendingEffects: Set<Component>;
  private _pendingUpdate: Set<Component>;

  /**
   * Create a root which renders into `container`.
   */
  constructor(container: Element) {
    (container as UReactRootElement)._ureactRoot = this;

    this.container = container;

    this._rootComponent = null;
    this._document = container.ownerDocument;
    this._pendingEffects = new Set();
    this._pendingUpdate = new Set();
  }

  /**
   * Render a VNode into the container element.
   */
  render(vnode: VNodeChild) {
    this._rootComponent = this._diff(
      null,
      this._rootComponent,
      vnode,
      this.container
    );
  }

  /**
   * Render a single VNode
   */
  _diff(
    parentComponent: Component | null,
    component: Component | null,
    vnode: VNodeChild,
    parent: Element
  ): Component {
    // Update the existing component if there is one and the types match.
    if (component) {
      const prevVnode = component.vnode;
      let typeMatched = false;

      if (isTextVNode(prevVnode) && isTextVNode(vnode)) {
        if (vnode !== prevVnode) {
          (component.dom as Text).data = vnode.toString();
        }
        typeMatched = true;
      } else if (isEmptyVNode(prevVnode) && isEmptyVNode(vnode)) {
        typeMatched = true;
      } else if (
        isValidElement(prevVnode) &&
        isValidElement(vnode) &&
        prevVnode.type === vnode.type
      ) {
        if (typeof vnode.type === "string") {
          const el = component.dom as Element;
          diffElementProps(el, prevVnode.props, vnode.props);
          component.output = this._diffList(
            component,
            component.output,
            vnode.props.children ?? null,
            el
          );
        } else if (typeof vnode.type === "function") {
          const result = this._renderCustom(vnode, component);
          component.output = this._diffList(
            parentComponent,
            component.output,
            result,
            parent
          );
        }
        typeMatched = true;
      }

      if (typeMatched) {
        component.vnode = vnode;
        return component;
      } else {
        this._unmount(component);
      }
    }

    // If there is no existing component or it has a different type, render it
    // from scratch.
    const newComponent = this._renderTree(parentComponent, vnode);
    if (newComponent !== component) {
      topLevelDomNodes(newComponent).forEach((node) => parent.append(node));
    }
    return newComponent;
  }

  /**
   * Render a list of VNodes.
   *
   * This list can be the children of a DOM VNode or the output of a custom
   * component VNode.
   */
  _diffList(
    parentComponent: Component | null,
    prevOutput: Component[],
    vnodes: VNodeChildren,
    parentElement: Element
  ): Component[] {
    const newOutput = [];
    const unmatchedOutput = new Set(prevOutput);

    if (vnodes) {
      // Number of non-keyed children from the new vnode rendered so far.
      let nonKeyedCount = -1;

      // The DOM node associated with the last-rendered child from the new
      // vnode, excluding children don't render any output.
      let lastDomOutput;

      for (let child of flattenChildren(vnodes)) {
        // Find the child from the previous render that corresponds to this
        // child.
        let prevComponent;
        const childKey = vnodeKey(child);
        if (childKey !== null) {
          prevComponent = prevOutput.find(
            (o) => vnodeKey(o.vnode) === childKey
          );
        } else {
          ++nonKeyedCount;
          let nonKeyedIndex = -1;
          prevComponent = prevOutput.find(
            (o) =>
              vnodeKey(o.vnode) === null && ++nonKeyedIndex === nonKeyedCount
          );
        }

        // Diff the child against the previous matching output, if any.
        let childComponent;
        if (prevComponent) {
          unmatchedOutput.delete(prevComponent);
          childComponent = this._diff(
            parentComponent,
            prevComponent,
            child,
            parentElement
          );
        } else {
          childComponent = this._renderTree(parentComponent, child);
        }

        // Ensure the output is in the correct position in the DOM.
        newOutput.push(childComponent);
        for (let node of topLevelDomNodes(childComponent)) {
          parentElement.insertBefore(
            node,
            lastDomOutput ? lastDomOutput.nextSibling : parentElement.firstChild
          );
          lastDomOutput = node;
        }

        const lastOutput = newOutput[newOutput.length - 1];
        if (lastOutput.dom) {
          lastDomOutput = lastOutput.dom;
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
   * Render a component tree beginning at `vnode`.
   */
  _renderTree(parent: Component | null, vnode: VNodeChild): Component {
    const newComponent: Component = {
      parent,
      depth: parent ? parent.depth + 1 : 0,
      vnode,
      output: [],
      dom: null,
      hooks: null,
    };

    if (isEmptyVNode(vnode)) {
      newComponent.dom = null;
    } else if (isTextVNode(vnode)) {
      newComponent.dom = this._document.createTextNode(vnode.toString());
    } else if (!isValidElement(vnode)) {
      throw new Error("Object is not a valid element");
    } else if (typeof vnode.type === "string") {
      const element = this._document.createElement(vnode.type);
      diffElementProps(element, {}, vnode.props);
      if (vnode.ref) {
        vnode.ref.current = element;
      }
      newComponent.dom = element;

      if (vnode.props.children != null) {
        for (let child of flattenChildren(vnode.props.children)) {
          const childComponent = this._renderTree(newComponent, child);
          newComponent.output.push(childComponent);
          topLevelDomNodes(childComponent).forEach((node) =>
            element.append(node)
          );
        }
      }
    } else if (typeof vnode.type === "function") {
      const result = this._renderCustom(vnode, newComponent);
      newComponent.output = Array.isArray(result)
        ? result.map((r) => this._renderTree(newComponent, r))
        : [this._renderTree(newComponent, result)];
    }

    return newComponent;
  }

  _renderCustom(vnode: VNode, component: Component) {
    if (!component.hooks) {
      component.hooks = new HookState(
        () => this._scheduleUpdate(component),
        () => this._scheduleEffects(component)
      );
    }
    this._pendingUpdate.delete(component);
    setHookState(component.hooks);

    const result = (vnode.type as Function).call(null, vnode.props);

    setHookState(null);
    return result;
  }

  _scheduleEffects(component: Component) {
    const isScheduled = this._pendingEffects.size > 0;
    if (!this._pendingEffects.has(component)) {
      this._pendingEffects.add(component);
    }
    if (!isScheduled) {
      // TODO - Use `requestAnimationFrame` or another method that will run
      // after rendering.
      queueMicrotask(() => this._flushEffects());
    }
  }

  _flushEffects() {
    if (this._pendingEffects.size === 0) {
      return;
    }
    for (let component of this._pendingEffects) {
      component.hooks!.runEffects();
    }
    this._pendingEffects.clear();
  }

  _scheduleUpdate(component: Component) {
    const isScheduled = this._pendingUpdate.size > 0;
    if (!this._pendingUpdate.has(component)) {
      this._pendingUpdate.add(component);
    }
    if (!isScheduled) {
      queueMicrotask(() => this._flushUpdates());
    }
  }

  _flushUpdates() {
    if (this._pendingUpdate.size === 0) {
      return;
    }

    const pending = [...this._pendingUpdate];
    pending.sort((a, b) => a.depth - b.depth);

    for (let component of pending) {
      if (!this._pendingUpdate.has(component)) {
        // Component is a child of one higher up the tree that was already
        // re-rendered.
        continue;
      }

      this._diff(
        component.parent,
        component,
        component.vnode,
        (getParentDom(component) as Element) || this.container
      );
    }
  }

  _unmount(component: Component, isUnmountingAncestor = false) {
    if (isValidElement(component.vnode)) {
      // Run cleanup that only applies to DOM and custom components.
      for (let child of component.output) {
        this._unmount(child, true);
      }

      if (component.vnode.ref) {
        component.vnode.ref.current = null;
      }

      // Run cleanup that only applies to custom components.
      if (typeof component.vnode.type === "function") {
        this._pendingUpdate.delete(component);
        this._pendingEffects.delete(component);
        component.hooks!.cleanup();
      }
    }

    if (!isUnmountingAncestor) {
      topLevelDomNodes(component).forEach((node) => node.remove());
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
