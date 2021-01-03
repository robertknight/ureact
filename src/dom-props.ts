import { Props } from "./jsx.js";
import { shallowEqual } from "./diff-utils.js";

// Properties added to DOM elements rendered by UReact.
interface UReactElement extends Element {
  _ureactListeners?: { [event: string]: Function | null };
}

function isEventListener(prop: string) {
  return prop.startsWith("on");
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
  const nameLower = prop.toLowerCase();
  if (nameLower in node) {
    eventName = nameLower.slice(2);
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

function updateInlineStyles(
  node: HTMLElement,
  oldValue: CSSStyleDeclaration,
  newValue: CSSStyleDeclaration
) {
  if (shallowEqual(oldValue, newValue)) {
    return;
  }
  node.style.cssText = "";
  for (let key in newValue) {
    node.style[key] = newValue[key];
  }
}

/**
 * Update the DOM property, attribute or event listener corresponding to
 * `prop`.
 */
function setProperty(
  node: Element,
  prop: string,
  oldValue: any,
  newValue: any
) {
  if (Object.is(oldValue, newValue)) {
    return;
  }

  if (prop === "style") {
    updateInlineStyles(node as HTMLElement, oldValue || {}, newValue);
    return;
  }

  if (isEventListener(prop)) {
    setEventListener(node, prop, newValue);
    return;
  }

  if (prop in node) {
    (node as any)[prop] = newValue;
  } else {
    node.setAttribute(prop, newValue);
  }
}

/**
 * Update the DOM properties, attributes and event listeners of `node` to match
 * a new VDOM node.
 */
export function diffElementProps(
  node: Element,
  oldProps: Props,
  newProps: Props
) {
  for (let prop in oldProps) {
    if (prop !== "children" && !(prop in newProps)) {
      unsetProperty(node, prop);
    }
  }

  for (let prop in newProps) {
    if (prop !== "children") {
      setProperty(node, prop, oldProps[prop], newProps[prop]);
    }
  }
}
