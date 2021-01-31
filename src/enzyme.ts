import {
  Props,
  VNode,
  VNodeChild,
  createElement,
  flattenChildren,
  isEmptyVNode,
  isTextVNode,
  isValidElement,
} from "./jsx.js";
import {
  BaseComponent,
  flushRoot,
  getRenderedOutput,
  render,
  unmountComponentAtNode,
} from "./render.js";

type Selector = string | Function | object;

/**
 * Call `visit` for each component in the tree rooted at `c`.
 *
 * If the visitor returns true, `visitTree` recurses into the output of `c`
 * (children of DOM nodes, output of a custom component).
 */
function visitTree(c: BaseComponent, visit: (child: BaseComponent) => boolean) {
  const visitChildren = visit(c);
  if (!visitChildren) {
    return;
  }
  for (let child of c.output) {
    visitTree(child, visit);
  }
}

function forEachDomRoot(
  c: BaseComponent,
  visit: (node: Element | Text) => void
) {
  if (c.dom !== null) {
    visit(c.dom);
  } else {
    c.output.forEach((child) => forEachDomRoot(child, visit));
  }
}

function isElement(n: Node): n is Element {
  return n.nodeType === 1;
}

/**
 * Return the string name of a DOM or custom component, for use in debug formatting
 * and selector matching.
 */
function elementName(vnode: VNode): string {
  if (typeof vnode.type === "string") {
    return vnode.type;
  } else if ("displayName" in vnode.type) {
    return (vnode.type as any).displayName;
  } else {
    return vnode.type.name;
  }
}

/**
 * Produce a string representation of a component tree that is convenient for
 * debugging purposes.
 */
function debugTree(c: BaseComponent): string {
  if (isTextVNode(c.vnode)) {
    return c.vnode.toString();
  } else if (isValidElement(c.vnode)) {
    let result = `<${elementName(c.vnode)}`;
    if (c.output.length === 0) {
      result += "/>";
    } else {
      result += ">";
      result += c.output.map(debugTree);
      result += `</${elementName(c.vnode)}>`;
    }
    return result;
  } else {
    return "";
  }
}

/**
 * Regex which matches valid element names, custom component names and identifiers in selectors
 * (class names, attributes)
 */
const idRegex = /^[A-Za-z0-9_-]+$/;

const quotedAttr = /"[^"]*"/;

const spaceRegex = /\s+/;

class TokenList {
  tokens: string[];

  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  get length() {
    return this.tokens.length;
  }

  peek() {
    return this.tokens[0];
  }

  consume(token: string | RegExp) {
    const next = this.peek();
    if (
      (token instanceof RegExp && !next.match(token)) ||
      (typeof token === "string" && next !== token)
    ) {
      throw new Error(`Expected "${next}" to match "${token}"`);
    }
    return this.tokens.shift()!;
  }

  maybeConsume(token: string | RegExp) {
    try {
      return this.consume(token);
    } catch {
      return null;
    }
  }
}

/**
 * A simple CSS selector that specifies properties of a single element.
 */
interface SimpleSelector {
  type: "simple";
  element: string | null;
  classList: string[];
  attributes: { [attr: string]: string };
}

type Combinator = " " | ">";

/**
 * A CSS selector that specifies properties of multiple elements and
 * the relationship between them (descendant, direct descendant, sibling etc.)
 */
interface CombinatorSelector {
  type: "combinator";
  left: SimpleSelector;
  right: SimpleSelector | CombinatorSelector;
  combinator: Combinator;
}

/** A selector that matches a custom component type. */
interface TypeSelector {
  type: "type";
  component: Function;
}

/** A selector that matches components with given props. */
interface PropsSelector {
  type: "props";
  props: Props;
}

function tokenizeSelector(selector: string): TokenList {
  // Match <Identifier> | <Quoted string> | <Whitespace> | <Special char>.
  const tokenStrings = selector.match(
    /[A-Za-z0-9_-]+|"[^"]+"|\s+|[\[\].,=#>]/g
  );
  if (!tokenStrings) {
    throw new Error("Invalid selector");
  }

  // Check that the whole selector was matched.
  const matchedLen = tokenStrings.reduce((len, str) => len + str.length, 0);
  if (matchedLen !== selector.length) {
    throw new Error("Invalid selector");
  }

  return new TokenList(tokenStrings);
}

function parseCombinatorSelector(
  tokens: TokenList
): CombinatorSelector | SimpleSelector {
  const simple = parseSimpleSelector(tokens);
  if (tokens.length === 0) {
    return simple;
  }

  let combinator = " " as Combinator;
  tokens.maybeConsume(spaceRegex);

  if (tokens.maybeConsume(">")) {
    combinator = ">";
    tokens.maybeConsume(spaceRegex);
  }

  return {
    type: "combinator",
    left: simple,
    right: parseCombinatorSelector(tokens),
    combinator,
  };
}

function parseSimpleSelector(tokens: TokenList): SimpleSelector {
  const element = tokens.maybeConsume(idRegex);

  // Parse class/ID selector.
  const classList = [] as string[];
  const attributes = {} as { [attr: string]: string };
  while (tokens.peek() === "." || tokens.peek() === "#") {
    if (tokens.maybeConsume(".")) {
      classList.push(tokens.consume(idRegex));
    } else {
      tokens.consume("#");
      attributes.id = tokens.consume(idRegex);
    }
  }

  // Parse prop/attribute selector.
  if (tokens.maybeConsume("[")) {
    do {
      const prop = tokens.consume(idRegex);
      tokens.consume("=");

      let value = tokens.maybeConsume(idRegex);
      if (!value) {
        value = tokens.consume(quotedAttr).slice(1, -1);
      }

      attributes[prop] = value;
    } while (tokens.maybeConsume(","));
    tokens.consume("]");
  }

  return {
    type: "simple",
    element,
    classList,
    attributes,
  };
}

/**
 * Return all matches for a simple CSS selector in the component tree `c`.
 */
function matchSimpleSelector(
  selector: SimpleSelector,
  c: BaseComponent,
  result: BaseComponent[] = [],
  matchChildren: boolean = true
): BaseComponent[] {
  if (!isValidElement(c.vnode)) {
    return result;
  }

  const vnode = c.vnode;

  let matches = true;

  // Match DOM / custom component type.
  if (selector.element && selector.element !== elementName(vnode)) {
    matches = false;
  }

  // Match class list.
  const classes = (vnode.props.className || "").split(/\s+/);
  if (!selector.classList.every((c) => classes.includes(c))) {
    matches = false;
  }

  // Match prop values.
  const attrs = selector.attributes;
  if (
    !Object.keys(attrs).every((key) => attrs[key] === String(vnode.props[key]))
  ) {
    matches = false;
  }

  if (matches) {
    result.push(c);
  }

  if (matchChildren) {
    for (let child of c.output) {
      matchSimpleSelector(selector, child, result);
    }
  }

  return result;
}

/**
 * Return all matches for a combinator selector in the component tree `c`.
 */
function matchCombinatorSelector(
  selector: CombinatorSelector,
  c: BaseComponent,
  results: BaseComponent[] = [],
  matchChildren: boolean = true
): BaseComponent[] {
  const matches = matchSimpleSelector(selector.left, c, [], matchChildren);
  const rest = selector.right;

  for (let match of matches) {
    for (let child of match.output) {
      const matchChildren = selector.combinator === " ";
      if (rest.type === "simple") {
        matchSimpleSelector(rest, child, results, matchChildren);
      } else {
        matchCombinatorSelector(rest, child, results, matchChildren);
      }
    }
  }

  return results;
}

/**
 * Return all custom components matching `selector.type` in the component tree `c`.
 */
function matchTypeSelector(
  selector: TypeSelector,
  c: BaseComponent,
  results: BaseComponent[] = []
): BaseComponent[] {
  if (!isValidElement(c.vnode)) {
    return [];
  }
  if (c.vnode.type === selector.component) {
    results.push(c);
  }
  for (let child of c.output) {
    if (isValidElement(c.vnode)) {
      matchTypeSelector(selector, child, results);
    }
  }
  return results;
}

/**
 * Return all components whose props match `selector.props` in the component tree `c`.
 */
function matchPropsSelector(
  selector: PropsSelector,
  c: BaseComponent,
  results: BaseComponent[] = []
) {
  const vnode = c.vnode;
  if (!isValidElement(vnode)) {
    return [];
  }

  const propsMatch = Object.keys(selector.props).every(
    (key) => selector.props[key] === vnode.props[key]
  );
  if (propsMatch) {
    results.push(c);
  }

  for (let child of c.output) {
    if (isValidElement(c.vnode)) {
      matchPropsSelector(selector, child, results);
    }
  }

  return results;
}

/**
 * SelectorMatcher parses Enzyme selectors [1] and matches them against
 * rendered component trees.
 *
 * [1] https://github.com/enzymejs/enzyme/blob/master/docs/api/selector.md
 */
class SelectorMatcher {
  private _selector:
    | SimpleSelector
    | CombinatorSelector
    | TypeSelector
    | PropsSelector;

  constructor(selector: Selector) {
    if (typeof selector === "object" && selector !== null) {
      this._selector = { type: "props", props: selector };
    } else if (typeof selector === "function") {
      this._selector = { type: "type", component: selector };
    } else if (typeof selector === "string") {
      try {
        const tokens = tokenizeSelector(selector);
        this._selector = parseCombinatorSelector(tokens);
      } catch (err) {
        throw new Error(`Invalid or unsupported selector "${selector}"`);
      }
    } else {
      throw new Error("Invalid selector");
    }
  }

  /** Return all components matching the selector in the tree rooted at `c`. */
  findMatches(c: BaseComponent): BaseComponent[] {
    switch (this._selector.type) {
      case "simple":
        return matchSimpleSelector(this._selector, c);
      case "combinator":
        return matchCombinatorSelector(this._selector, c);
      case "type":
        return matchTypeSelector(this._selector, c);
      case "props":
        return matchPropsSelector(this._selector, c);
    }
  }
}

/**
 * Create a static copy of a component tree with all empty vnodes removed.
 */
function cloneTree(components: BaseComponent[]): BaseComponent[] {
  return components
    .filter((c) => !isEmptyVNode(c.vnode))
    .map((c) => {
      if (Object.isFrozen(c)) {
        return c;
      }

      return Object.freeze({
        vnode: c.vnode,
        dom: c.dom,
        output: cloneTree(c.output),
      }) as BaseComponent;
    });
}

function propsEqual(a: VNode, b: VNode) {
  for (let prop in a.props) {
    if (prop !== "children" && !Object.is(a.props[prop], b.props[prop])) {
      return false;
    }
  }
  for (let prop in b.props) {
    if (prop !== "children" && !(prop in a.props)) {
      return false;
    }
  }
  return true;
}

function vnodesMatch(a: VNodeChild, b: VNodeChild) {
  if (isTextVNode(a) && isTextVNode(b)) {
    return a.toString() === b.toString();
  } else if (isValidElement(a) && isValidElement(b)) {
    return a.type === b.type && propsEqual(a, b);
  } else {
    return false;
  }
}

function treeMatches(c: BaseComponent, vnode: VNodeChild): boolean {
  if (!vnodesMatch(c.vnode, vnode)) {
    return false;
  }
  if (!isValidElement(vnode)) {
    return true;
  }
  const children = flattenChildren(vnode.props.children).filter(
    (child) => !isEmptyVNode(child)
  );
  return (
    c.output.length === children.length &&
    c.output.every((child, i) => treeMatches(child, children[i] as VNodeChild))
  );
}

function treeContains(c: BaseComponent, vnode: VNodeChild): boolean {
  return (
    treeMatches(c, vnode) ||
    c.output.some((child) => treeContains(child, vnode))
  );
}

function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * A wrapper around output from rendering that provides an easy way to traverse
 * and query it.
 *
 * The API implemented here is a subset of the "Full Rendering API" from Enzyme.
 * See https://github.com/enzymejs/enzyme/blob/master/docs/api/mount.md
 */
class Wrapper {
  /** The root wrapper for the component at the top of the render tree. */
  private _root: Wrapper;

  /**
   * Set of root components matched by this wrapper.
   * For the root wrapper this is the output of the initial render.
   *
   * This set only contains non-empty components. Empty components are filtered
   * by `cloneTree`.
   */
  private _components: BaseComponent[];

  /**
   * Container element into which the root component was rendered.
   * Only set on the root wrapper.
   */
  private _container: Element | null;

  constructor(
    root: Wrapper | null,
    components: BaseComponent | BaseComponent[],
    container?: Element | null
  ) {
    this._components = cloneTree(
      Array.isArray(components) ? components : [components]
    );
    this._root = root ?? this;
    this._container = container ?? null;
  }

  at(index: number): Wrapper {
    if (index < 0 || this.length <= index) {
      throw new Error("Index is invalid");
    }
    return this._wrap(this._components[index]);
  }

  children(): Wrapper {
    const children = this._components.map((c) => c.output).flat();
    return this._wrap(children);
  }

  contains(node: VNodeChild): boolean {
    return this._components.some((c) => treeContains(c, node));
  }

  debug(): string {
    return this._components.map(debugTree).join("\n");
  }

  exists(query?: Selector): boolean {
    if (query === undefined) {
      return this.length > 0;
    } else {
      return this.find(query).length > 0;
    }
  }

  filter(query: Selector): Wrapper {
    const parsed = new SelectorMatcher(query);
    const matches = this._components.filter((c) =>
      parsed.findMatches(c).includes(c)
    );
    return this._wrap(matches);
  }

  filterWhere(predicate: (w: Wrapper) => boolean): Wrapper {
    const matches = this._components.filter((c) => predicate(this._wrap(c)));
    return this._wrap(matches);
  }

  find(query: Selector): Wrapper {
    const parsed = new SelectorMatcher(query);
    const matches = this._components.map((c) => parsed.findMatches(c)).flat();
    return this._wrap(unique(matches));
  }

  findWhere(predicate: (w: Wrapper) => boolean): Wrapper {
    const matches = [] as BaseComponent[];
    this._forEachComponent((child) => {
      if (predicate(this._wrap(child))) {
        matches.push(child);
        return false;
      } else {
        return true;
      }
    });
    return this._wrap(matches);
  }

  first(): Wrapper {
    return this.at(0);
  }

  forEach(callback: (w: Wrapper, index?: number) => void) {
    let i = 0;
    for (let c of this._components) {
      if (isValidElement(c.vnode)) {
        callback(this._wrap(c), i);
        ++i;
      }
    }
  }

  getDOMNode(): Element | Text {
    const c = this._singleComponent("getDOMNode");
    const nodes = [] as (Element | Text)[];
    forEachDomRoot(c, (node) => nodes.push(node));
    if (nodes.length === 0) {
      throw new Error("Component is not a DOM node");
    }
    return nodes[0];
  }

  hasClass(className: string): boolean {
    const node = this.getDOMNode();
    if (!isElement(node)) {
      throw new Error("Not a DOM element");
    }
    return node.classList.contains(className);
  }

  html(): string {
    let html = "";

    this._forEachComponent((child) => {
      if (child.dom) {
        if (isElement(child.dom)) {
          html += child.dom.outerHTML;
        } else {
          html += child.dom.nodeValue;
        }
        return false;
      } else {
        return true;
      }
    });

    return html;
  }

  instance() {
    return this.getDOMNode();
  }

  key() {
    const c = this._singleComponent("key");
    if (!isValidElement(c.vnode)) {
      throw new Error("Component is not a DOM or custom component");
    }
    return c.vnode.key;
  }

  last() {
    return this.at(this._components.length - 1);
  }

  get length() {
    return this._components.length;
  }

  map<T>(callback: (w: Wrapper, index?: number) => T): T[] {
    const results = [] as T[];
    this.forEach((wrapper, index) => {
      results.push(callback(wrapper, index));
    });
    return results;
  }

  prop(name: string) {
    return this.props()[name];
  }

  props(): Props {
    const c = this._singleComponent("props");
    if (!isValidElement(c.vnode)) {
      throw new Error("Component is not a DOM or custom component");
    }
    return c.vnode.props;
  }

  setProps(props: object) {
    if (this !== this._root) {
      this._root.setProps(props);
      return;
    }

    const c = this._singleComponent("setProps");
    if (!isValidElement(c.vnode)) {
      throw new Error("Component is not a DOM or custom component");
    }
    const vnode = createElement(c.vnode.type, { ...c.vnode.props, ...props });
    render(vnode, this._container!);
    flushRoot(this._container!);
    this.update();
  }

  simulate(eventName: string, args: EventInit = {}) {
    const { bubbles, cancelable, composed, ...rest } = args;
    const event = new Event(eventName, {
      bubbles,
      cancelable,
      composed,
    });
    Object.assign(event, rest);

    this.getDOMNode().dispatchEvent(event);
    flushRoot(this._root._container!);

    this.update();
  }

  text(): string {
    let text = "";

    this._forEachComponent((child) => {
      if (isTextVNode(child.vnode)) {
        text += child.vnode.toString();
      }
      return true;
    });

    return text;
  }

  type() {
    const c = this._singleComponent("type");

    // For consistency with Enzyme, return a nullish value for text nodes.
    return isValidElement(c.vnode) ? c.vnode.type : null;
  }

  unmount() {
    if (this._root !== this) {
      this._root.unmount();
      return;
    }
    unmountComponentAtNode(this._container!);
  }

  update() {
    if (this._root !== this) {
      this._root.update();
      return;
    }

    const root = getRenderedOutput(this._container!);
    if (!root) {
      throw new Error("Component is unmounted");
    }
    this._components = cloneTree([root]);
  }

  _singleComponent(context: string): BaseComponent {
    if (this.length !== 1) {
      throw new Error(
        `${context}() called on a wrapper with ${this.length} nodes. Must have one node.`
      );
    }
    return this._components[0];
  }

  _forEachComponent(callback: (c: BaseComponent) => boolean) {
    for (let c of this._components) {
      visitTree(c, callback);
    }
  }

  _wrap(c: BaseComponent | BaseComponent[]) {
    return new Wrapper(this._root, c);
  }
}

export interface MountOptions {
  attachTo?: Element;
}

/**
 * Render a VNode into a DOM container element and return a wrapper around the
 * output which can be used to query and interact with it.
 *
 * The returned wrapper implements a subset of the "Full Rendering API" from
 * Enzyme. See https://github.com/enzymejs/enzyme/blob/master/docs/api/mount.md.
 */
export function mount(vnode: VNodeChild, options: MountOptions = {}) {
  const container = options.attachTo || document.createElement("div");
  render(vnode, container);
  flushRoot(container);
  return new Wrapper(null, getRenderedOutput(container)!, container);
}

/**
 * `Wrapper` is exported as `ReactWrapper` for consistency with the Enzyme API.
 */
export { Wrapper as ReactWrapper };
