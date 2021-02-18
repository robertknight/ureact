import {
  Props,
  VNode,
  VNodeChild,
  VNodeChildren,
  flattenChildren,
  isEmptyVNode,
  isTextVNode,
  isValidElement,
} from "./jsx.js";
import { ContextProvider } from "./context.js";
import { HookState, Task, setHookState } from "./hooks.js";
import { diffElementProps } from "./dom-props.js";
import { arraysEqual } from "./diff-utils.js";

/** Types of DOM node which a component can render. */
export type DOMOutput = Element | Text;

/**
 * Backing object for a rendered vnode.
 *
 * This tracks the last vnode that was rendered, the children (for a DOM component)
 * or output (for a custom component) and the DOM node.
 *
 * `BaseComponent` contains only the basic structure of the rendered tree.
 * It does not include information about internal state of components or pre-computed
 * pointers/flags etc. that are used internally by the renderer.
 */
export interface BaseComponent {
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
  dom: DOMOutput | null;
}

/**
 * Backing tree for a rendered vnode.
 */
interface Component extends BaseComponent {
  /**
   * The parent component. This is not set on the root component or the
   * empty component.
   */
  parent: Component | null;

  /** The depth of the component from the root. Not set on the empty component. */
  depth: number;

  /**
   * Lazily-allocated hook data for component. This is only set for components
   * that use hooks.
   */
  hooks: HookState | null;

  /**
   * The context data that this component exposes to its descendants.
   */
  contextProvider: ContextProvider<any> | null;

  /** Whether this component is an `<svg>` DOM component or a child of one. */
  svg: boolean;

  /**
   * Top-level DOM descendants of this component.
   *
   * This is only set on custom components.
   */
  domRoots: DOMOutput[] | null;
}

/**
 * The component instance that represents all empty vnodes.
 */
const emptyComponent: Component = Object.freeze({
  parent: null,
  depth: -1,
  vnode: null,
  output: [],
  dom: null,
  hooks: null,
  contextProvider: null,
  svg: false,
  domRoots: null,
});

function vnodeKey(vnode: any) {
  return isValidElement(vnode) ? vnode.key : null;
}

interface ErrorBoundaryProps extends Props {
  handler: (e: Error) => void;
}

interface ErrorBoundaryVNode extends VNode {
  props: ErrorBoundaryProps;
}

/** Special component that catches unhandled errors in descendants. */
export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  return children;
}

function isErrorBoundary(vnode: VNodeChild): vnode is ErrorBoundaryVNode {
  return isValidElement(vnode) && vnode.type === ErrorBoundary;
}

/**
 * Run a callback for each top-level DOM node rendered by a component.
 */
function forEachDomRoot(c: Component, visit: (node: DOMOutput) => void) {
  if (c.dom !== null) {
    visit(c.dom);
  } else if (c.domRoots !== null) {
    c.domRoots.forEach(visit);
  }
}

/**
 * Update the `domRoots` of a custom component to match its currently rendered
 * output. This must be called after any child custom components are re-rendered.
 */
function updateDomRoots(c: Component) {
  const newRoots = [];
  for (let child of c.output) {
    if (child.dom !== null) {
      newRoots.push(child.dom);
    } else if (child.domRoots !== null) {
      newRoots.push(...child.domRoots);
    }
  }
  c.domRoots = newRoots;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Map between container elements and render roots.
 */
const activeRoots = new Map<Element, Root>();

interface RenderError {
  error: Error;
  handled: boolean;
}

/**
 * Ensure a DOM `node` is located at a given position in the DOM.
 */
function insertNodeAfter(node: Node, parent: Element, after: Node | null) {
  const before = after ? after.nextSibling : parent.firstChild;

  // Calling `parent.insertBefore` has overhead and side effects (eg. causing
  // the element to lose focus) even if the node would logically be positioned
  // in the same place afterwards, so only call if necessary.
  if (
    node.parentNode !== parent ||
    (node !== before && node.nextSibling !== before)
  ) {
    parent.insertBefore(node, before);
  }
}

/** Schedule a callback to run after the screen is updated. */
function scheduleAfterRender(callback: () => void) {
  let didRun = false;
  const runOnce = () => {
    if (!didRun) {
      didRun = true;
      callback();
    }
  };
  if (typeof requestAnimationFrame === "function") {
    // requestAnimationFrame fires right before the screen is updated, so delay
    // the callback until just after.
    requestAnimationFrame(() => {
      setTimeout(runOnce, 1);
    });

    // Schedule a fallback in case requestAnimationFrame is not called, eg.
    // because the page is hidden.
    setTimeout(runOnce, 100);
  } else {
    setTimeout(runOnce, 10);
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
  /** The DOM element into which this root renders. */
  container: Element;

  /** The root component produced by the most recent render. */
  private _rootComponent: Component | null;

  /** The DOM `Document` to which `container` belongs. */
  private _document: Document;

  /** Components with pending state updates that need to be re-rendered. */
  private _pendingUpdate: Set<Component>;

  /** Components with pending layout effects that need to be run. */
  private _pendingLayoutEffects: Set<Component>;

  /** Components with pending effects that need to be run. */
  private _pendingEffects: Set<Component>;

  /**
   * Error thrown during the current render or other invocation of user code
   * which has not yet been handled.
   */
  private _currentError: RenderError | null;

  /** Component which is currently being rendered. */
  private _rendering: Component | null;

  /** Create or return the hook data for the currently-rendering component. */
  private _getHookState: () => HookState;

  /**
   * Create a root which renders into `container`.
   */
  constructor(container: Element) {
    this.container = container;

    this._rootComponent = null;
    this._document = container.ownerDocument;

    this._pendingUpdate = new Set();
    this._pendingLayoutEffects = new Set();
    this._pendingEffects = new Set();

    this._currentError = null;
    this._rendering = null;

    this._getHookState = () => {
      const component = this._rendering!;
      if (component.hooks) {
        return component.hooks;
      }

      component.hooks = new HookState({
        schedule: (task) => this._schedule(component, task),
        getContext: (type) => this._getContext(component, type),
        registerContext: (provider) => (component.contextProvider = provider),
      });
      return component.hooks;
    };

    activeRoots.set(container, this);
  }

  /**
   * Remove all of the rendered DOM nodes from the current tree and run any
   * cleanup associated with components (eg. effect cleanup callbacks).
   */
  unmount() {
    this.render(null);
    activeRoots.delete(this.container);
  }

  /**
   * Update the component tree rendered into this root's container to match
   * `vnode`.
   *
   * If an unhandled error occurs during rendering, the component tree is unmounted
   * and the error is re-thrown.
   */
  render(vnode: VNodeChild) {
    this._rootComponent = this._diff(
      null,
      this._rootComponent,
      vnode,
      this.container,
      null
    );
    this._flushEffects(Task.RunLayoutEffects);
    this._handlePendingError();
  }

  /**
   * Flush all pending state updates and effects.
   *
   * If an unhandled error occurs during re-rendering or running an effect, the
   * component tree is unmounted and the error is re-thrown.
   */
  flush() {
    while (
      this._pendingUpdate.size > 0 ||
      this._pendingLayoutEffects.size > 0 ||
      this._pendingEffects.size > 0
    ) {
      this._flushUpdates();
      this._flushEffects(Task.RunLayoutEffects);
      this._flushEffects(Task.RunEffects);
    }
  }

  getOutput(): BaseComponent | null {
    return this._rootComponent;
  }

  /**
   * Create or update a component to match a `vnode`.
   *
   * `component` is the existing component to update or `null` if there is no
   * such component. `vnode` is the new vnode value. `parent` and `insertAfter`
   * specify where to insert any new DOM nodes created in the process.
   */
  _diff(
    parentComponent: Component | null,
    component: Component | null,
    vnode: VNodeChild,
    parent: Element,
    insertAfter: Node | null
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
          this._diffOutput(component, vnode.props.children ?? null, el, null);
        } else if (typeof vnode.type === "function") {
          const output = this._renderCustom(vnode, component);
          this._diffOutput(component, output, parent, insertAfter);
        }
        typeMatched = true;
      }

      if (typeMatched) {
        if (!isEmptyVNode(vnode)) {
          component.vnode = vnode;
        }
        return component;
      } else {
        this._unmount(component);
      }
    }

    // If there is no existing component or it has a different type, render it
    // from scratch.
    const newComponent = this._renderTree(parentComponent ?? null, vnode);
    forEachDomRoot(newComponent, (node) => {
      insertNodeAfter(node, parent, insertAfter);
      insertAfter = node;
    });
    return newComponent;
  }

  /**
   * Update the output of a component to match `vnodes`.
   *
   * The output of a DOM component is just the component's children. The output
   * of a custom component is the result of calling it with the current props.
   */
  _diffOutput(
    component: Component,
    vnodes: VNodeChildren,
    parentElement: Element,
    insertAfter: Node | null
  ) {
    const prevOutput = component.output;
    const newOutput = [];

    const domRoots: DOMOutput[] | null =
      component.domRoots !== null ? [] : null;

    if (vnodes) {
      for (let child of flattenChildren(vnodes)) {
        // Find the child from the previous render that corresponds to this
        // child.
        const childKey = vnodeKey(child);
        const prevComponentIndex = prevOutput.findIndex(
          (o) => vnodeKey(o.vnode) === childKey
        );

        // Diff the child against the previous matching output, if any.
        const prevComponent =
          prevComponentIndex !== -1 ? prevOutput[prevComponentIndex] : null;
        let childComponent;
        if (prevComponent) {
          // Remove the matched component from `prevOutput`, so that at the end
          // we are left with a list of non-matched items.
          prevOutput.splice(prevComponentIndex, 1);

          childComponent = this._diff(
            component,
            prevComponent,
            child,
            parentElement,
            insertAfter
          );
        } else {
          childComponent = this._renderTree(component, child);
        }

        // Ensure the output is in the correct position in the DOM.
        forEachDomRoot(childComponent, (node) => {
          insertNodeAfter(node, parentElement, insertAfter);
          insertAfter = node;
          domRoots?.push(node);
        });

        newOutput.push(childComponent);
      }
    }

    // Remove all the output from the previous render which was not matched
    // against output from the new render.
    for (let unmatched of prevOutput) {
      this._unmount(unmatched);
    }

    component.output = newOutput;
    component.domRoots = domRoots;
  }

  /**
   * Render a new component tree described by `vnode`.
   */
  _renderTree(parent: Component | null, vnode: VNodeChild): Component {
    if (isEmptyVNode(vnode)) {
      return emptyComponent;
    }

    const newComponent: Component = {
      parent,
      depth: parent ? parent.depth + 1 : 0,
      vnode,
      output: [],
      dom: null,
      hooks: null,
      contextProvider: null,
      svg: parent ? parent.svg : false,
      domRoots: null,
    };

    if (isTextVNode(vnode)) {
      newComponent.dom = this._document.createTextNode(vnode.toString());
    } else if (!isValidElement(vnode)) {
      throw new Error("Object is not a valid element");
    } else if (typeof vnode.type === "string") {
      newComponent.svg = newComponent.svg || vnode.type === "svg";
      const element = newComponent.svg
        ? this._document.createElementNS(SVG_NAMESPACE, vnode.type)
        : this._document.createElement(vnode.type);
      diffElementProps(element, {}, vnode.props);
      if (vnode.props.ref) {
        vnode.props.ref.current = element;
      }
      newComponent.dom = element;

      if (vnode.props.children != null) {
        for (let child of flattenChildren(vnode.props.children)) {
          const childComponent = this._renderTree(newComponent, child);
          newComponent.output.push(childComponent);
          forEachDomRoot(childComponent, (node) => element.append(node));
        }
      }
    } else if (typeof vnode.type === "function") {
      const output = this._renderCustom(vnode, newComponent);

      const domRoots = [] as DOMOutput[];
      for (let child of flattenChildren(output)) {
        const childComponent = this._renderTree(newComponent, child);
        newComponent.output.push(childComponent);
        forEachDomRoot(childComponent, (node) => domRoots.push(node));
      }
      newComponent.domRoots = domRoots;
    }

    return newComponent;
  }

  /**
   * Return the ancestor of `component` which provides context of a given `type`.
   */
  _getContext(component: Component, type: any) {
    let parent = component.parent;
    while (parent) {
      if (parent.contextProvider?.type === type) {
        return parent.contextProvider!;
      }
      parent = parent.parent;
    }
    return null;
  }

  _renderCustom(vnode: VNode, component: Component) {
    this._pendingUpdate.delete(component);

    this._rendering = component;
    this._rendering.hooks?.resetIndex();
    setHookState(this._getHookState);

    let output;
    try {
      output = (vnode.type as Function).call(null, vnode.props);
    } catch (err) {
      output = null;
      this._invokeErrorHandler(component, err);
    }

    this._rendering = null;
    setHookState(null);

    return output;
  }

  /**
   * Find the nearest error handler for a component and invoke it with `error`.
   *
   * If no error handler is found, the `_currentError` field is set. At the end
   * of the current render, effect flush or other activity, `handlePendingError`
   * should be called to handle any pending unhandled errors.
   */
  _invokeErrorHandler(context: Component, error: Error) {
    if (this._currentError) {
      // Only the first unhandled error in any activity is reported.
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

  _taskQueue(task: Task) {
    switch (task) {
      case Task.Update:
        return this._pendingUpdate;
      case Task.RunLayoutEffects:
        return this._pendingLayoutEffects;
      case Task.RunEffects:
        return this._pendingEffects;
    }
  }

  /**
   * Schedule re-rendering or effects for a component.
   */
  _schedule(component: Component, task: Task) {
    const queue = this._taskQueue(task);
    const isScheduled = queue.size > 0;

    queue.add(component);

    if (!isScheduled) {
      switch (task) {
        case Task.Update:
          queueMicrotask(() => this._flushUpdates());
          break;
        case Task.RunEffects:
          scheduleAfterRender(() => this._flushEffects(task));
          break;
        // Layout effects are run synchronously at the end of render, so
        // no flush is scheduled for them here.
      }
    }
  }

  _flushEffects(task: Task) {
    const queue = this._taskQueue(task);
    for (let component of queue) {
      try {
        component.hooks!.run(task);
      } catch (err) {
        this._invokeErrorHandler(component, err);
      }
    }
    queue.clear();
    this._handlePendingError();
  }

  _flushUpdates() {
    // Flushing updates may trigger additional state changes, so we
    // loop until the update queue is empty.
    const queue = this._pendingUpdate;
    while (queue.size > 0) {
      const pending = [...queue];
      pending.sort((a, b) => a.depth - b.depth);

      for (let component of pending) {
        if (!queue.has(component)) {
          // Component is a child of one higher up the tree that was already
          // re-rendered.
          continue;
        }

        // Find the DOM position to insert any DOM nodes generated by rendering the
        // updated component.
        let insertAfter = null as Node | null;
        let ancestor = component;
        let parent = component.parent;
        while (parent) {
          const ancestorIndex = parent.output.indexOf(ancestor);
          for (let i = ancestorIndex - 1; i >= 0 && !insertAfter; i--) {
            const sibling = parent.output[i];
            if (sibling.dom) {
              insertAfter = sibling.dom;
            } else if (
              sibling.domRoots !== null &&
              sibling.domRoots.length > 0
            ) {
              insertAfter = sibling.domRoots[sibling.domRoots.length - 1];
            }
          }
          if (insertAfter || parent.dom) {
            break;
          }

          ancestor = parent;
          parent = parent.parent;
        }

        let parentDom;
        if (insertAfter) {
          parentDom = insertAfter.parentElement as Element;
        } else if (parent?.dom) {
          parentDom = parent.dom as Element;
        } else {
          parentDom = this.container;
        }
        const prevDomRoots = component.domRoots!;

        // Re-render the updated component.
        this._diff(
          component.parent,
          component,
          component.vnode,
          parentDom,
          insertAfter
        );

        // Update `domRoots` of any non-DOM parents.
        if (!arraysEqual(prevDomRoots, component.domRoots!)) {
          let parent = component.parent;
          while (parent && !parent.dom) {
            updateDomRoots(parent);
            parent = parent.parent;
          }
        }
      }

      this._flushEffects(Task.RunLayoutEffects);
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

  /**
   * Remove a component from the DOM and run any associated cleanup.
   */
  _unmount(component: Component, isUnmountingAncestor = false) {
    if (isValidElement(component.vnode)) {
      // Run cleanup that only applies to DOM and custom components.
      for (let child of component.output) {
        this._unmount(child, true);
      }

      // Clear component ref. We only do this if the ref refers to the DOM element
      // being removed in case the same ref has been used for a new component mounted
      // in place of this one.
      const ref = component.vnode.props.ref;
      if (ref && ref.current === component.dom) {
        ref.current = null;
      }

      // Run cleanup that only applies to custom components.
      if (typeof component.vnode.type === "function") {
        this._pendingUpdate.delete(component);
        this._pendingLayoutEffects.delete(component);
        this._pendingEffects.delete(component);

        try {
          component.hooks?.cleanup();
        } catch (err) {
          this._invokeErrorHandler(component, err);
        }
      }
    }

    if (!isUnmountingAncestor) {
      forEachDomRoot(component, (node) => node.remove());
    }
  }
}

/**
 * Return all the `Root`s for currently mounted component trees.
 */
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
 * Return a `BaseComponent` tree describing the currently rendered content
 * inside a container element.
 */
export function getRenderedOutput(container: Element): BaseComponent | null {
  const root = activeRoots.get(container);
  if (!root) {
    return null;
  }
  return root.getOutput();
}

/**
 * Flush pending state updates and effects in a specific root.
 */
export function flushRoot(container: Element) {
  const root = activeRoots.get(container);
  if (root) {
    root.flush();
  }
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
