import { Props } from "./jsx.js";
import { shallowEqual } from "./diff-utils.js";

// Properties added to DOM elements rendered by UReact.
interface UReactElement extends Element {
  _ureactListeners?: { [event: string]: Function | null };
}

/** Metadata about a DOM property, attribute or event listener. */
interface PropMeta {
  /** Name of the prop. */
  name: string;

  /** Name of the DOM attribute to set. */
  attrName: string;

  /**
   * Whether the DOM element has a writeable property whose name matches
   * the prop name.
   */
  writable: boolean;

  /**
   * Name of the DOM event associated with this prop, or `null` if the prop
   * is not an event listener.
   */
  eventName: string | null;

  /** Whether to use a capture listener for this prop. */
  useCapture: boolean;
}

interface PropsMeta {
  [prop: string]: PropMeta;
}

/**
 * Map from DOM element prototype to metadata for the various DOM properties.
 */
const elementPropData = new Map<Object, PropsMeta>();

function getPropertyMeta(el: Element, prop: string): PropMeta {
  const proto = Object.getPrototypeOf(el);
  let elementProps = elementPropData.get(proto);
  if (!elementProps) {
    elementProps = {};
    elementPropData.set(proto, elementProps);
  }

  let propMeta = elementProps[prop];
  if (!propMeta) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
    let eventName = null as string | null;
    let useCapture = false;

    if (prop.startsWith("on")) {
      useCapture = prop.endsWith("Capture");

      // Remove "on" prefix and "Capture" suffix to get the event name for use
      // with `addEventListener`.
      eventName = prop.slice(2, useCapture ? -7 : undefined);

      // Use a heuristic to test if this is a native DOM event, in which case
      // it uses a lower-case name.
      const nameLower = eventName.toLowerCase();
      if ("on" + nameLower in el) {
        eventName = nameLower;
      }
    }
    const writable = !!(descriptor && (descriptor.writable || descriptor.set));

    propMeta = {
      name: prop,
      attrName: prop === "className" ? "class" : prop,
      writable,
      eventName,
      useCapture,
    };
    elementProps[prop] = propMeta;
  }

  return propMeta;
}

/**
 * Create or update an event listener on a DOM element.
 */
function setEventListener(
  el: Element,
  prop: PropMeta,
  value: (e: Event) => any
) {
  const ureactEl = el as UReactElement;
  const listeners =
    ureactEl._ureactListeners || (ureactEl._ureactListeners = {});

  if (!listeners[prop.name]) {
    el.addEventListener(
      prop.eventName as string,
      (event) => listeners[prop.name]?.(event),
      prop.useCapture
    );
  }
  listeners[prop.name] = value;
}

function unsetProperty(el: Element, prop: PropMeta) {
  if (prop.eventName) {
    const noopListener = () => {};
    setEventListener(el, prop, noopListener);
  } else if (prop.writable) {
    (el as any)[prop.name] = "";
  } else {
    el.removeAttribute(prop.attrName);
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
  prop: PropMeta,
  oldValue: any,
  newValue: any
) {
  if (prop.name === "style") {
    updateInlineStyles(el as HTMLElement, oldValue || {}, newValue);
  } else if (prop.eventName !== null) {
    setEventListener(el, prop, newValue);
  } else if (prop.writable) {
    (el as any)[prop.name] = newValue;
  } else if (prop.name === "dangerouslySetInnerHTML") {
    if (oldValue?.__html !== newValue.__html) {
      el.innerHTML = newValue.__html;
    }
  } else {
    el.setAttribute(prop.attrName, newValue);
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
      const meta = getPropertyMeta(el, prop);
      unsetProperty(el, meta);
    }
  }

  for (let prop in newProps) {
    if (prop !== "children") {
      const oldValue = oldProps[prop];
      const newValue = newProps[prop];

      if (Object.is(oldValue, newValue)) {
        return;
      }

      const meta = getPropertyMeta(el, prop);
      setProperty(el, meta, oldValue, newValue);
    }
  }
}
