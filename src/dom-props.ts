import { Props } from "./jsx.js";
import { shallowEqual } from "./diff-utils.js";

// Properties added to DOM elements rendered by UReact.
interface UReactElement extends Element {
  _ureactListeners?: { [event: string]: Function | null };
}

// List of flags used by `PropMeta`.
const PROP_CAPTURE_EVENT = 2;

type DOMPropType = "property" | "attribute" | "event" | "styles" | "html";

/** Metadata about a DOM property, attribute or event listener. */
interface PropMeta {
  /** Name of the prop. */
  name: string;

  type: DOMPropType;

  /** Name of DOM property, attribute or event. */
  domName: string;

  /** Flags that determine how this DOM prop is set or updated. */
  flags: number;
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
    let type: DOMPropType;
    let domName = prop;
    let flags = 0;

    if (prop === "style") {
      type = "styles";
    } else if (prop === "dangerouslySetInnerHTML") {
      type = "html";
    } else if (prop.startsWith("on")) {
      type = "event";

      if (prop.endsWith("Capture")) {
        flags |= PROP_CAPTURE_EVENT;
      }

      // Remove "on" prefix and "Capture" suffix to get the event name for use
      // with `addEventListener`.
      let eventName = prop.slice(
        2,
        flags & PROP_CAPTURE_EVENT ? -7 : undefined
      );

      // Use a heuristic to test if this is a native DOM event, in which case
      // it uses a lower-case name.
      const nameLower = eventName.toLowerCase();
      if ("on" + nameLower in el) {
        eventName = nameLower;
      }
      domName = eventName;
    } else {
      const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
      if (prop === "className") {
        domName = "class";
      }
      if (descriptor && (descriptor.writable || descriptor.set)) {
        type = "property";
      } else {
        type = "attribute";
      }
    }

    propMeta = {
      type,
      name: prop,
      domName,
      flags,
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
      prop.domName as string,
      (event) => listeners[prop.name]?.(event),
      !!(prop.flags & PROP_CAPTURE_EVENT)
    );
  }
  listeners[prop.name] = value;
}

function unsetProperty(el: Element, prop: PropMeta) {
  switch (prop.type) {
    case "property":
      (el as any)[prop.name] = "";
      break;
    case "attribute":
      el.removeAttribute(prop.domName);
      break;
    case "event":
      const noopListener = () => {};
      setEventListener(el, prop, noopListener);
      break;
    case "styles":
      (el as HTMLElement).style.cssText = "";
      break;
    case "html":
      el.innerHTML = "";
      break;
  }
}

const cssPropertySupportsPixels = new Map<string, boolean>();

function acceptsPixels(testEl: HTMLElement, key: string) {
  let supportsPixels = cssPropertySupportsPixels.get(key);
  if (typeof supportsPixels === "boolean") {
    return supportsPixels;
  }
  testEl.style[key as any] = "0px";
  supportsPixels = testEl.style[key as any] === "0px";
  cssPropertySupportsPixels.set(key, supportsPixels);
  return supportsPixels;
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
    let value = newValue[key];
    if (typeof value === "number" && acceptsPixels(el, key)) {
      value = value + "px";
    }
    el.style[key] = value;
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
  switch (prop.type) {
    case "property":
      (el as any)[prop.name] = newValue;
      break;
    case "attribute":
      el.setAttribute(prop.domName, newValue);
      break;
    case "event":
      setEventListener(el, prop, newValue);
      break;
    case "html":
      if (oldValue?.__html !== newValue.__html) {
        el.innerHTML = newValue.__html;
      }
      break;
    case "styles":
      updateInlineStyles(el as HTMLElement, oldValue || {}, newValue);
      break;
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
        continue;
      }

      const meta = getPropertyMeta(el, prop);
      setProperty(el, meta, oldValue, newValue);
    }
  }
}
