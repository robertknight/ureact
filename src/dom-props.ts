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
 * Cache of DOM property metadata, keyed by DOM element prototype and property
 * name.
 */
const elementPropData = new Map<Object, PropsMeta>();

/**
 * Get the metadata that instructs us how to set a given prop on a DOM element.
 *
 * This metadata is computed when a prop is first set for a given DOM element
 * type and then cached for future updates.
 */
function getPropertyMeta(el: Element, prop: string): PropMeta {
  // Lookup cached metadata.
  const proto = Object.getPrototypeOf(el);
  let elementProps = elementPropData.get(proto);
  if (!elementProps) {
    elementProps = {};
    elementPropData.set(proto, elementProps);
  }

  let propMeta = elementProps[prop];
  if (propMeta) {
    return propMeta;
  }

  // No cached metadata found, compute it and cache for future usage.
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
    let eventName = prop.slice(2, flags & PROP_CAPTURE_EVENT ? -7 : undefined);

    // Use a heuristic to test if this is a native DOM event, in which case
    // it uses a lower-case name.
    const nameLower = eventName.toLowerCase();
    if ("on" + nameLower in el) {
      eventName = nameLower;
    }
    domName = eventName;
  } else {
    let descriptor;
    if (prop in el) {
      // Search up the prototype chain to find the property descriptor for this
      // property.
      let currentProto = proto;
      do {
        descriptor = Object.getOwnPropertyDescriptor(currentProto, prop);
        currentProto = Object.getPrototypeOf(currentProto);
      } while (!descriptor && proto !== "Element");
    }

    // If the DOM element has a settable property that matches the prop name
    // then we'll write directly to the DOM property, otherwise fallback to
    // using an attribute.
    if (descriptor && (descriptor.writable || descriptor.set)) {
      type = "property";
    } else {
      type = "attribute";

      // For SVG elements the `className` property exists but is not writable.
      // Therefore we fall back to the corresponding attribute, which has a different
      // name than the property.
      if (prop === "className") {
        domName = "class";
      }
    }
  }

  propMeta = {
    type,
    name: prop,
    domName,
    flags,
  };
  elementProps[prop] = propMeta;

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

/**
 * Test whether a CSS property accepts pixel values.
 *
 * If it does, numeric values for the corresponding style property are converted
 * to 'px' values.
 */
function acceptsPixels(testEl: HTMLElement, styleProperty: string) {
  let supportsPixels = cssPropertySupportsPixels.get(styleProperty);
  if (typeof supportsPixels === "boolean") {
    return supportsPixels;
  }
  testEl.style[styleProperty as any] = "0px";
  supportsPixels = testEl.style[styleProperty as any] === "0px";
  cssPropertySupportsPixels.set(styleProperty, supportsPixels);
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
    if (prop !== "children" && prop !== "ref" && !(prop in newProps)) {
      const meta = getPropertyMeta(el, prop);
      unsetProperty(el, meta);
    }
  }

  for (let prop in newProps) {
    if (prop !== "children" && prop !== "ref") {
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
