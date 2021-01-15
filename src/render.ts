import { Props, VNode, VNodeChildren, isValidElement } from "./jsx.js";
import { ContextProvider } from "./context.js";
import { EffectTiming, HookState, setHookState } from "./hooks.js";
import { diffElementProps } from "./dom-props.js";

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

  contextProvider: ContextProvider<any> | null;

  /** Whether this component is an `<svg>` DOM component or a child of one. */
  svg: boolean;
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
type VNodeChild = string | boolean | number | null | undefined | VNode;

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
 * Return true if `vnode` does not render any output.
 */
function isEmptyVNode(vnode: VNodeChild): vnode is null | boolean {
  return vnode == null || typeof vnode === "boolean";
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

interface ErrorBoundaryProps extends Props {
  handler: (e: Error) => void;
}

interface ErrorBoundaryVNode extends VNode {
  props: ErrorBoundaryProps;
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  return children;
}

function isErrorBoundary(vnode: VNodeChild): vnode is ErrorBoundaryVNode {
  return isValidElement(vnode) && vnode.type === ErrorBoundary;
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

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const activeRoots = new Map<Element, Root>();

interface RenderError {
  error: Error;
  handled: boolean;
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
  private _pendingLayoutEffects: Set<Component>;
  private _pendingUpdate: Set<Component>;
  private _currentError: RenderError | null;

  /**
   * Create a root which renders into `container`.
   */
  constructor(container: Element) {
    this.container = container;

    this._rootComponent = null;
    this._document = container.ownerDocument;
    this._pendingEffects = new Set();
    this._pendingLayoutEffects = new Set();
    this._pendingUpdate = new Set();
    this._currentError = null;

    activeRoots.set(container, this);
  }

  unmount() {
    this.render(null);
    activeRoots.delete(this.container);
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
    this._handlePendingError();
  }

  /**
   * Flush all pending state updates and effects.
   */
  flush() {
    while (
      this._pendingUpdate.size > 0 ||
      this._pendingLayoutEffects.size > 0 ||
      this._pendingEffects.size > 0
    ) {
      this._flushUpdates();
      this._flushLayoutEffects();
      this._flushEffects();
    }
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
      if (prevVnode === vnode && !this._pendingUpdate.has(component)) {
        // Bail out if vnode is same as previous render, unless there is a pending
        // state update for this component.
        return component;
      }

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
      contextProvider: null,
      svg: parent ? parent.svg : false,
    };

    if (isEmptyVNode(vnode)) {
      newComponent.dom = null;
    } else if (isTextVNode(vnode)) {
      newComponent.dom = this._document.createTextNode(vnode.toString());
    } else if (!isValidElement(vnode)) {
      throw new Error("Object is not a valid element");
    } else if (typeof vnode.type === "string") {
      newComponent.svg = newComponent.svg || vnode.type === "svg";
      const element = newComponent.svg
        ? this._document.createElementNS(SVG_NAMESPACE, vnode.type)
        : this._document.createElement(vnode.type);
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

  _getContext(component: Component, type: any) {
    let parent = component.parent;
    while (parent) {
      if (parent.contextProvider?.type === type) {
        return parent.contextProvider!;
      }
      parent = parent.parent;
    }
    throw new Error("No provider available for context type");
  }

  _renderCustom(vnode: VNode, component: Component) {
    if (!component.hooks) {
      // We currently initialize a `HookState` for every component, whether it
      // uses them or not. This could be optimized by initializing `HookState`
      // lazily and also creating a class for the connector.
      component.hooks = new HookState({
        scheduleUpdate: () => this._scheduleUpdate(component),
        scheduleEffects: (when) => this._scheduleEffects(component, when),
        getContext: (type) => this._getContext(component, type),
        registerContext: (provider) => (component.contextProvider = provider),
      });
    }
    this._pendingUpdate.delete(component);

    setHookState(component.hooks);
    let result;
    try {
      result = (vnode.type as Function).call(null, vnode.props);
    } catch (err) {
      result = null;
      this._invokeErrorHandler(component, err);
    }
    setHookState(null);

    return result;
  }

  _invokeErrorHandler(context: Component, error: Error) {
    if (this._currentError) {
      // Only the first error in any render is reported.
      return;
    }

    let handled = false;
    let errorHandler = context as Component | null;
    while (errorHandler !== null) {
      try {
        const vnode = errorHandler.vnode;
        if (isErrorBoundary(vnode)) {
          vnode.props.handler(error);
          handled = true;
          break;
        }
      } catch (boundaryError) {
        error = boundaryError;
      }
      errorHandler = errorHandler.parent;
    }

    this._currentError = {
      error,
      handled,
    };
  }

  _scheduleEffects(component: Component, when: EffectTiming) {
    if (when === EffectTiming.afterRender) {
      const isScheduled = this._pendingEffects.size > 0;
      if (!this._pendingEffects.has(component)) {
        this._pendingEffects.add(component);
      }
      if (!isScheduled) {
        // TODO - Use `requestAnimationFrame` or another method that will run
        // after rendering.
        queueMicrotask(() => this._flushEffects());
      }
    } else {
      const isScheduled = this._pendingLayoutEffects.size > 0;
      if (!this._pendingLayoutEffects.has(component)) {
        this._pendingLayoutEffects.add(component);
      }
      if (!isScheduled) {
        queueMicrotask(() => this._flushLayoutEffects());
      }
    }
  }

  _flushLayoutEffects() {
    for (let component of this._pendingLayoutEffects) {
      component.hooks!.runEffects(EffectTiming.beforeRender);
    }
    this._pendingLayoutEffects.clear();
  }

  _flushEffects() {
    for (let component of this._pendingEffects) {
      component.hooks!.runEffects(EffectTiming.afterRender);
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

    this._handlePendingError();
  }

  /** Finish handling any pending error at the end of a render. */
  _handlePendingError() {
    if (!this._currentError) {
      return;
    }
    const lastError = this._currentError;
    this._currentError = null;

    if (!lastError.handled) {
      // Following React, unmount the entire tree if an error is uncaught:
      // https://reactjs.org/docs/error-boundaries.html#new-behavior-for-uncaught-errors
      this.render(null);
      throw lastError.error;
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
        this._pendingLayoutEffects.delete(component);
        component.hooks!.cleanup();
      }
    }

    if (!isUnmountingAncestor) {
      topLevelDomNodes(component).forEach((node) => node.remove());
    }
  }
}

export function getRoots() {
  return activeRoots.values();
}

/**
 * Render a VNode into a DOM element
 *
 * See https://reactjs.org/docs/react-dom.html#render.
 */
export function render(vnode: VNodeChild, container: Element) {
  const root = activeRoots.get(container) ?? new Root(container);
  root.render(vnode);
}

/**
 * Remove any rendered component from a DOM element and clean up any associated
 * state.
 */
export function unmountComponentAtNode(container: Element) {
  const root = activeRoots.get(container);
  if (!root) {
    return false;
  }
  root.unmount();
  return true;
}
