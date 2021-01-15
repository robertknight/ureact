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
  const useCapture = prop.endsWith("Capture");

  // Remove "on" prefix and "Capture" suffix to get the event name for use
  // with `addEventListener`.
  let eventName = prop.slice(2, useCapture ? -7 : undefined);

  // Use a heuristic to test if this is a native DOM event, in which case
  // it uses a lower-case name.
  const nameLower = eventName.toLowerCase();
  if ("on" + nameLower in el) {
    eventName = nameLower;
  }

  if (!listeners[prop]) {
    el.addEventListener(
      eventName,
      (event) => listeners[prop]?.(event),
      useCapture
    );
  }
  listeners[prop] = value;
}

function attrForProp(prop: string, isSvg: boolean) {
  return isSvg && prop === "className" ? "class" : prop;
}

function unsetProperty(el: Element, isSvg: boolean, prop: string) {
  if (isEventListener(prop)) {
    const noopListener = () => {};
    setEventListener(el, prop, noopListener);
  }

  if (!isSvg && prop in el) {
    (el as any)[prop] = "";
  } else {
    el.removeAttribute(attrForProp(prop, isSvg));
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
function setProperty(
  el: Element,
  isSvg: boolean,
  prop: string,
  oldValue: any,
  newValue: any
) {
  if (Object.is(oldValue, newValue)) {
    return;
  }

  if (prop === "style") {
    updateInlineStyles(el as HTMLElement, oldValue || {}, newValue);
  } else if (isEventListener(prop)) {
    setEventListener(el, prop, newValue);
  } else if (!isSvg && prop in el) {
    (el as any)[prop] = newValue;
  } else if (prop === "dangerouslySetInnerHTML") {
    if (oldValue?.__html !== newValue.__html) {
      el.innerHTML = newValue.__html;
    }
  } else {
    el.setAttribute(attrForProp(prop, isSvg), newValue);
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
  // We could use `el instanceof SVGElement` here, but that would not work if
  // rendering is done in an environment where `SVGElement` is not in the global
  // scope, or if the element comes from a different window which has its own
  // globals.
  const isSvg = "ownerSVGElement" in el;

  for (let prop in oldProps) {
    if (prop !== "children" && !(prop in newProps)) {
      unsetProperty(el, isSvg, prop);
    }
  }

  for (let prop in newProps) {
    if (prop !== "children") {
      setProperty(el, isSvg, prop, oldProps[prop], newProps[prop]);
    }
  }
}
