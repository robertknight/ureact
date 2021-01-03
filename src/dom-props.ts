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
function setEventListener(el: Element, prop: string, value: (e: Event) => any) {
  const ureactEl = el as UReactElement;
  const listeners =
    ureactEl._ureactListeners || (ureactEl._ureactListeners = {});

  let eventName = prop.slice(2);

  // Use a heuristic to test if this is a native DOM event, in which case
  // it uses a lower-case name.
  const nameLower = prop.toLowerCase();
  if (nameLower in el) {
    eventName = nameLower.slice(2);
  }

  if (!listeners[eventName]) {
    el.addEventListener(eventName, (event) => listeners[eventName]?.(event));
  }
  listeners[eventName] = value;
}

function unsetProperty(el: Element, prop: string) {
  if (isEventListener(prop)) {
    const noopListener = () => {};
    setEventListener(el, prop, noopListener);
  }

  if (prop in el) {
    (el as any)[prop] = "";
  } else {
    el.removeAttribute(prop);
  }
}

function updateInlineStyles(
  el: HTMLElement,
  oldValue: CSSStyleDeclaration,
  newValue: CSSStyleDeclaration
) {
  if (shallowEqual(oldValue, newValue)) {
    return;
  }
  el.style.cssText = "";
  for (let key in newValue) {
    el.style[key] = newValue[key];
  }
}

/**
 * Update the DOM property, attribute or event listener corresponding to
 * `prop`.
 */
function setProperty(el: Element, prop: string, oldValue: any, newValue: any) {
  if (Object.is(oldValue, newValue)) {
    return;
  }

  if (prop === "style") {
    updateInlineStyles(el as HTMLElement, oldValue || {}, newValue);
  } else if (isEventListener(prop)) {
    setEventListener(el, prop, newValue);
  } else if (prop in el) {
    (el as any)[prop] = newValue;
  } else if (prop === "dangerouslySetInnerHTML") {
    if (oldValue?.__html !== newValue.__html) {
      el.innerHTML = newValue.__html;
    }
  } else {
    el.setAttribute(prop, newValue);
  }
}

/**
 * Update the DOM properties, attributes and event listeners of `node` to match
 * a new VDOM node.
 */
export function diffElementProps(
  el: Element,
  oldProps: Props,
  newProps: Props
) {
  for (let prop in oldProps) {
    if (prop !== "children" && !(prop in newProps)) {
      unsetProperty(el, prop);
    }
  }

  for (let prop in newProps) {
    if (prop !== "children") {
      setProperty(el, prop, oldProps[prop], newProps[prop]);
    }
  }
}
