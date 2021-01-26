import chai from "chai";
import sinon from "sinon";
const { assert } = chai;

import {
  ErrorBoundary,
  Fragment,
  createElement as h,
  render,
  unmountComponentAtNode,
  useState,
} from "../build/index.js";
import { act } from "../build/test-utils.js";

import { delay } from "./utils/delay.js";
import { createScratchpad } from "./utils/scratchpad.js";

/**
 * Attach a numeric tag, starting at 1, to each node in a sequence.
 *
 * These tags are used to check that nodes are preserved or not-preserved as
 * expected across renders.
 */
function tagNodes(nodes) {
  Array.from(nodes).forEach((n, i) => (n.$tag = i + 1));
}

/** Get an array of tags attached to `nodes` by `tagNodes`. */
function getTags(nodes) {
  return Array.from(nodes).map((n) => n.$tag ?? null);
}

// VNode values that render no output.
// See https://reactjs.org/docs/jsx-in-depth.html#booleans-null-and-undefined-are-ignored.
const nullishValues = [null, undefined, false, true];

describe("rendering", () => {
  const scratch = createScratchpad();

  beforeEach(() => {
    scratch.reset();
  });

  after(() => {
    scratch.cleanup();
  });

  describe("empty VNode rendering", () => {
    nullishValues.forEach((value) => {
      it(`"${value}" renders nothing`, () => {
        const container = scratch.render(null);
        assert.equal(container.innerHTML, "");
      });
    });
  });

  describe("DOM text rendering", () => {
    it("renders a text node", () => {
      const container = scratch.render("Hello world");
      assert.equal(container.innerHTML, "Hello world");
    });

    it("updates a text node", () => {
      const container = scratch.render("Hello world");
      const text = container.firstChild;
      scratch.render("Goodbye");
      assert.equal(text.data, "Goodbye");
    });
  });

  // Tests for DOM element creation. Detailed tests for handling of DOM properties
  // are in `test/dom-props.js`.
  describe("DOM element rendering", () => {
    it("creates a DOM element and sets properties", () => {
      const container = scratch.render(
        h("a", { href: "https://example.com/" })
      );
      assert.equal(container.innerHTML, '<a href="https://example.com/"></a>');
    });

    it("sets `ref` prop to DOM node", () => {
      const ref = {};
      const container = scratch.render(h("div", { ref }));
      assert.equal(container.innerHTML, "<div></div>");
      assert.equal(ref.current, container.firstChild);
    });

    it("unsets `ref` when DOM component is unmounted", () => {
      const ref = {};
      const container = scratch.render(h("div", { ref }));
      assert.equal(ref.current, container.firstChild);
      scratch.render(h(null));
      assert.equal(ref.current, null);
    });
  });

  // Tests for DOM element creation. Detailed tests for handling of custom
  // properties, event listeners etc. are in `test/dom-props.js`.
  describe("custom DOM element rendering", () => {
    let CustomWidget;

    before(() => {
      CustomWidget = class CustomWidget extends scratch.window.HTMLElement {
        constructor() {
          super();
        }
      };
      scratch.window.customElements.define("custom-widget", CustomWidget);
    });

    it("creates a custom DOM element", () => {
      const container = scratch.render(h("custom-widget"));
      assert.equal(container.innerHTML, "<custom-widget></custom-widget>");
      assert.isTrue(container.firstChild instanceof CustomWidget);
    });
  });

  describe("DOM element child rendering", () => {
    it("renders element child", () => {
      const container = scratch.render(h("p", {}, h("b", {})));
      assert.equal(container.innerHTML, "<p><b></b></p>");
    });

    it("renders array of element children", () => {
      const container = scratch.render(h("p", {}, h("b", {}), h("i", {})));
      assert.equal(container.innerHTML, "<p><b></b><i></i></p>");
    });

    it("renders text child", () => {
      const container = scratch.render(h("p", {}, "Hello world"));
      assert.equal(container.innerHTML, "<p>Hello world</p>");
    });

    it("renders number child", () => {
      const container = scratch.render(h("p", {}, 42));
      assert.equal(container.innerHTML, "<p>42</p>");
    });

    it("renders array of text children", () => {
      const container = scratch.render(h("p", {}, "Hello", " ", "world"));
      assert.equal(container.innerHTML, "<p>Hello world</p>");
    });

    nullishValues.forEach((value) => {
      it(`ignores nullish children (${value})`, () => {
        const container = scratch.render(h("p", {}, "Hello", value, " world"));
        assert.equal(container.innerHTML, "<p>Hello world</p>");
      });
    });

    it("renders array children", () => {
      const items = ["Item 1", "Item 2", "Item 3"];
      const container = scratch.render(
        h(
          "ul",
          {},
          items.map((it) => h("li", {}, it))
        )
      );
      assert.equal(
        container.innerHTML,
        "<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>"
      );
    });

    it("throws an error if child is not a renderable item", () => {
      assert.throws(() => {
        scratch.render(h("ul", {}, "One", {}, "Two"));
      }, "Object is not a valid element");
    });

    it("does not modify DOM if element positions are unchanged", async () => {
      const App = () => {
        return h(
          "ul",
          {},
          h("li", {}, h("b", {}, "Item one")),
          h("li", {}, h("b", {}, "Item two")),
          h("li", {}, h("b", {}, "Item three"))
        );
      };

      const container = scratch.render(h(App));
      const mutations = [];
      const observer = new scratch.window.MutationObserver((ms) =>
        mutations.push(...ms)
      );
      observer.observe(container, { childList: true, subtree: true });

      scratch.render(h(App));
      await delay(0); // Wait for mutation notifications to be delivered.

      assert.deepEqual(mutations, []);
    });

    it("can transition an empty child to a non-empty child", () => {
      const App = ({ showChild }) => {
        return h("div", {}, showChild && h("span", {}, "Child"));
      };

      const container = scratch.render(h(App, { showChild: false }));

      scratch.render(h(App, { showChild: true }));
      assert.equal(container.innerHTML, "<div><span>Child</span></div>");

      scratch.render(h(App, { showChild: false }));
      assert.equal(container.innerHTML, "<div></div>");
    });
  });

  describe("SVG element rendering", () => {
    it("renders SVG elements", () => {
      const container = scratch.render(
        h(
          "svg",
          { width: 400, height: 100 },
          h("rect", {
            width: 300,
            height: 100,
            style: {
              fill: "rgb(0,0,255)",
            },
          })
        )
      );

      assert.equal(
        container.innerHTML,
        '<svg width="400" height="100"><rect width="300" height="100" style="fill: rgb(0,0,255);"></rect></svg>'
      );

      assert.instanceOf(container.firstChild, scratch.window.SVGSVGElement);
      assert.instanceOf(
        container.firstChild.firstChild,
        scratch.window.SVGElement
      );
    });

    it("renders SVG elements with non-DOM parent", () => {
      const Rect = () => h("rect");
      const container = scratch.render(h("svg", {}, h(Rect)));
      assert.equal(container.innerHTML, "<svg><rect></rect></svg>");
      assert.instanceOf(
        container.querySelector("rect"),
        scratch.window.SVGElement
      );
    });
  });

  describe("DOM element re-rendering", () => {
    it("updates child text nodes", () => {
      const container = scratch.render(h("div", {}, "Hello ", "world"));

      const textNodes = [...container.firstChild.childNodes];
      scratch.render(h("div", {}, "Goodbye ", "everyone"));

      assert.equal(container.innerHTML, "<div>Goodbye everyone</div>");
      const newTextNodes = [...container.firstChild.childNodes];
      assert.deepEqual(textNodes, newTextNodes);
    });

    it("does nothing to empty nodes", () => {
      const container = scratch.render(h("div", {}, false, "Hello", false));
      scratch.render(h("div", {}, false, "Hello", false));
      assert.deepEqual(container.innerHTML, "<div>Hello</div>");
    });

    it("updates unkeyed children", () => {
      const container = scratch.render(
        h(
          "div",
          {},
          h("a", { href: "https://example.org/" }),
          h("a", { href: "https://wibble.com/" })
        )
      );

      const linkElA = container.querySelectorAll("a")[0];
      const linkElB = container.querySelectorAll("a")[1];
      assert.equal(
        container.innerHTML,
        '<div><a href="https://example.org/"></a><a href="https://wibble.com/"></a></div>'
      );

      render(
        h(
          "div",
          {},
          h("a", { href: "https://foobar.com/" }),
          h("a", { href: "https://worp.com/" })
        ),
        container
      );

      assert.equal(linkElA.href, "https://foobar.com/");
      assert.equal(linkElB.href, "https://worp.com/");
      assert.equal(
        container.innerHTML,
        '<div><a href="https://foobar.com/"></a><a href="https://worp.com/"></a></div>'
      );
    });

    it("removes element children that are no longer present", () => {
      const container = scratch.render(
        h("div", {}, "Hello ", h("b", {}, "brave new"), "world")
      );
      scratch.render(h("div", {}, "Hello ", "world"));
      assert.equal(container.innerHTML, "<div>Hello world</div>");
    });

    it("removes text children that are no longer present", () => {
      const container = scratch.render(
        h("div", {}, "Hello ", "brave new ", "world")
      );
      scratch.render(h("div", {}, "Hello ", "world"));
      assert.equal(container.innerHTML, "<div>Hello world</div>");
    });

    it("updates children with matching key", () => {
      const container = scratch.render(
        h(
          "ul",
          {},
          h("li", { key: 1 }, "Item 1"),
          h("li", { key: 2 }, "Item 2")
        )
      );
      const item1 = container.querySelectorAll("li")[0];
      const item2 = container.querySelectorAll("li")[1];

      render(
        h(
          "ul",
          {},
          h("li", { key: 2 }, "Updated Item 2"),
          h("li", { key: 1 }, "Updated Item 1")
        ),
        container
      );
      assert.equal(item1.textContent, "Updated Item 1");
      assert.equal(item2.textContent, "Updated Item 2");
    });

    it("reorders children with matching keys", () => {
      const container = scratch.render(
        h(
          "ul",
          {},
          h("li", { key: 1 }, "Item 1"),
          h("li", { key: 2 }, "Item 2")
        )
      );

      render(
        h(
          "ul",
          {},
          h("li", { key: 2 }, "Updated Item 2"),
          h("li", { key: 1 }, "Updated Item 1")
        ),
        container
      );

      assert.equal(
        container.innerHTML,
        "<ul><li>Updated Item 2</li><li>Updated Item 1</li></ul>"
      );
    });

    it("inserts new keyed children at correct location", () => {
      const container = scratch.render(
        h("ul", {}, h("li", { key: 1 }, "Item 1"), h("li", {}, "Last Item"))
      );

      render(
        h(
          "ul",
          {},
          h("li", { key: 1 }, "Item 1"),
          h("li", { key: 2 }, "Item 2"),
          h("li", {}, "Last Item")
        ),
        container
      );

      assert.equal(
        container.innerHTML,
        "<ul><li>Item 1</li><li>Item 2</li><li>Last Item</li></ul>"
      );
    });

    it("inserts new unkeyed children at correct location", () => {
      const container = scratch.render(
        h(
          "ul",
          {},
          h("li", { key: 1 }, "Item 1"),
          h("li", { key: 2 }, "Item 2"),
          h("li", {}, "Last Item")
        )
      );
      const ulEl = container.firstChild;
      tagNodes(ulEl.childNodes);

      render(
        h(
          "ul",
          {},
          h("li", { key: 1 }, "Item 1"),
          h("li", {}, "Middle Item"),
          h("li", { key: 2 }, "Item 2"),
          h("li", {}, "Last Item")
        ),
        container
      );
      assert.equal(
        container.innerHTML,
        "<ul><li>Item 1</li><li>Middle Item</li><li>Item 2</li><li>Last Item</li></ul>"
      );
      assert.deepEqual(getTags(ulEl.childNodes), [1, 3, 2, null]);
    });

    it("removes a DOM child if the type changes", () => {
      const container = scratch.render(h("p", {}, h("i", {}, "Hello")));
      scratch.render(h("p", {}, h("b", {}, "Hello")));
      assert.equal(container.innerHTML, "<p><b>Hello</b></p>");
    });

    nullishValues.forEach((nullishValue) => {
      it("removes a conditionally rendered child if condition changes to false", () => {
        const container = scratch.render(h("p", {}, h("i", {}, "Hello")));
        scratch.render(h("p", {}, nullishValue));
        assert.equal(container.innerHTML, "<p></p>");
      });
    });
  });

  function Button({ label }) {
    return h("button", {}, label);
  }

  describe("custom component rendering", () => {
    it("renders a custom component", () => {
      const container = scratch.render(h(Button, { label: "Click me" }));
      assert.equal(container.innerHTML, "<button>Click me</button>");
    });

    nullishValues.forEach((nullishValue) => {
      it(`renders a custom component that returns ${nullishValue}`, () => {
        const EmptyComponent = () => nullishValue;
        const container = scratch.render(h(EmptyComponent));
        assert.equal(container.innerHTML, "");
      });
    });

    it("renders a custom component that returns a string", () => {
      const TextComponent = ({ text }) => text;
      const container = scratch.render(
        h(TextComponent, { text: "Hello world" })
      );
      assert.equal(container.innerHTML, "Hello world");
    });

    it("renders a custom component that returns an array", () => {
      const ArrayComponent = () => ["Hello ", "world"];
      const container = scratch.render(h(ArrayComponent));
      assert.equal(container.innerHTML, "Hello world");
    });

    it("renders a custom component with children", () => {
      function Button({ children }) {
        return h("button", {}, children);
      }
      const container = scratch.render(h(Button, {}, "Click me"));
      assert.equal(container.innerHTML, "<button>Click me</button>");
    });

    it("renders a tree of custom components", () => {
      function Parent() {
        return h(
          "div",
          {},
          h(Button, { label: "First" }),
          h(Button, { label: "Second" })
        );
      }
      const container = scratch.render(h(Parent));
      assert.equal(
        container.innerHTML,
        "<div><button>First</button><button>Second</button></div>"
      );
    });

    it("renders a deeply nested tree of custom components", () => {
      const ThirdLevel = ({ children }) => h("p", {}, children);
      const SecondLevel = ({ children }) => h(ThirdLevel, {}, children);
      const FirstLevel = ({ children }) => h(SecondLevel, {}, children);

      const container = scratch.render(h(FirstLevel, {}, "Hello world"));

      assert.equal(container.innerHTML, "<p>Hello world</p>");
    });
  });

  describe("custom component re-rendering", () => {
    it("updates a custom component", () => {
      const container = scratch.render(h(Button, { label: "Click me" }));
      scratch.render(h(Button, { label: "Updated" }));
      assert.equal(container.innerHTML, "<button>Updated</button>");
    });

    it("updates a custom component that returns text", () => {
      const TextComponent = ({ children }) => children;
      const container = scratch.render(h(TextComponent, {}, "One"));
      assert.equal(container.innerHTML, "One");

      scratch.render(h(TextComponent, {}, "Two"));
      assert.equal(container.innerHTML, "Two");

      scratch.render(h(TextComponent, {}, "Three"));
      assert.equal(container.innerHTML, "Three");
    });

    it("updates a custom component that returns null", () => {
      const EmptyComponent = () => null;
      const container = scratch.render(h(EmptyComponent));

      scratch.render(h(EmptyComponent));
      scratch.render(h(EmptyComponent));

      assert.equal(container.innerHTML, "");
    });

    it("updates a custom component with children", () => {
      function Button({ children }) {
        return h("button", {}, children);
      }
      const container = scratch.render(h(Button, {}, "Click me"));
      scratch.render(h(Button, {}, "Updated"));
      assert.equal(container.innerHTML, "<button>Updated</button>");
    });

    it("updates a custom component that returns an array", () => {
      const List = ({ items }) => items.map((item) => h("li", {}, item));
      const container = scratch.render(h(List, { items: ["One", "two"] }));
      scratch.render(h(List, { items: ["Three", "four", "five"] }));
      assert.equal(
        container.innerHTML,
        "<li>Three</li><li>four</li><li>five</li>"
      );
    });

    it("updates positions of keyed custom component children", () => {
      function Button({ children }) {
        return h("button", {}, children);
      }
      const container = scratch.render(
        h("div", {}, h(Button, { key: 1 }, "One"), h(Button, { key: 2 }, "Two"))
      );

      const buttonOne = container.querySelectorAll("button")[0];
      const buttonTwo = container.querySelectorAll("button")[1];

      // Render a new tree, swapping the order of the buttons and updating their
      // labels.
      render(
        h(
          "div",
          {},
          h(Button, { key: 2 }, "Three"),
          h(Button, { key: 1 }, "Four")
        ),
        container
      );

      assert.equal(
        container.innerHTML,
        "<div><button>Three</button><button>Four</button></div>"
      );
      assert.equal(buttonOne.textContent, "Four");
      assert.equal(buttonOne.parentElement.parentElement, container);
      assert.equal(buttonTwo.textContent, "Three");
      assert.equal(buttonTwo.parentElement.parentElement, container);
    });

    it("updates non-keyed custom component children", () => {
      function Button({ children }) {
        return h("button", {}, children);
      }
      const container = scratch.render(
        h("div", {}, h(Button, {}, "One"), h(Button, {}, "Two"))
      );

      const buttonOne = container.querySelectorAll("button")[0];
      const buttonTwo = container.querySelectorAll("button")[1];

      // Render a new tree, swapping the order of the buttons.
      // Since no keys are used, the existing buttons will be updated rather
      // than swapping their DOM elements.
      render(
        h("div", {}, h(Button, {}, "Two"), h(Button, {}, "One")),
        container
      );

      assert.equal(
        container.innerHTML,
        "<div><button>Two</button><button>One</button></div>"
      );
      assert.equal(buttonOne.textContent, "Two");
      assert.equal(buttonOne.parentElement.parentElement, container);
      assert.equal(buttonTwo.textContent, "One");
      assert.equal(buttonTwo.parentElement.parentElement, container);
    });

    it("bails out of re-rendering when vnodes are unchanged", () => {
      let parentRenderCount = 0;
      let childRenderCount = 0;

      const Child = () => {
        ++childRenderCount;
        return "Hello world";
      };

      const childNode = h(Child);

      const App = () => {
        ++parentRenderCount;
        return h("div", {}, childNode);
      };

      const container = scratch.render(h(App));
      scratch.render(h(App));

      assert.equal(container.innerHTML, "<div>Hello world</div>");
      assert.equal(parentRenderCount, 2);
      assert.equal(childRenderCount, 1);
    });
  });

  describe("re-rendering after state updates", () => {
    it("inserts updated component at correct position", () => {
      const ChildA = () => h("div", {}, "ChildA");
      const ChildB = () => {
        const [clicked, setClicked] = useState(false);
        return h(
          "button",
          { onClick: () => setClicked(true) },
          `ChildB:${clicked}`
        );
      };
      const ChildC = () => h("div", {}, "ChildC");

      // Create a parent to wrap the custom components. Note that the `ChildB`
      // component is wrapped in a custom component. This means that finding
      // the DOM node to position the updated `ChildB`'s content after can't
      // just look at the immediate siblings of `ChildB` but rendering has to
      // look up the tree.
      const Parent = () =>
        h("div", {}, h(ChildA), h(Fragment, {}, h(ChildB)), h(ChildC));

      const container = scratch.render(h(Parent));

      assert.equal(container.textContent, "ChildAChildB:falseChildC");

      // Trigger re-render of the `ChildB` component.
      act(() => {
        container.querySelector("button").click();
      });

      // Check that `ChildB` was correctly updated and is correctly positioned.
      assert.equal(container.textContent, "ChildAChildB:trueChildC");
    });

    it("flushes state updates that are triggered during a state update", async () => {
      // Contrived example of a child component which updates its state during
      // render in response to changes in props.
      const Child = ({ count }) => {
        const [childCount, setChildCount] = useState(count);
        if (count !== childCount) {
          setChildCount(count);
        }
        return childCount;
      };

      const Parent = () => {
        const [count, setCount] = useState(10);
        return h(
          "button",
          { onClick: () => setCount((c) => c + 1) },
          h(Child, { count })
        );
      };

      const container = scratch.render(h(Fragment, {}, h(Parent), h(Parent)));
      assert.equal(
        container.innerHTML,
        "<button>10</button><button>10</button>"
      );

      // Trigger multiple state update in `Parent`s. This ensures that when the
      // first state update to a `Child` happens during re-rendering, there will
      // still be pending updates from the previous render to process.
      container.querySelectorAll("button")[0].click();
      container.querySelectorAll("button")[1].click();

      // Await flush naturally. Avoid `act` here because this test checks that
      // updates are scheduled naturally.
      await delay(0);

      assert.equal(
        container.innerHTML,
        "<button>11</button><button>11</button>"
      );
    });

    it("only re-renders a child once if both it and a parent have a pending state update", () => {
      let childRenderCount = 0;
      const Child = () => {
        ++childRenderCount;
        const [count, setCount] = useState(0);
        const onClick = () => setCount((c) => c + 1);

        return h("button", { id: "child", onClick }, count);
      };

      let parentRenderCount = 0;
      const Parent = () => {
        ++parentRenderCount;
        const [count, setCount] = useState(0);
        const onClick = () => setCount((c) => c + 1);

        return h(
          "div",
          {},
          h("button", { id: "parent", onClick }, count),
          h(Child)
        );
      };

      const container = scratch.render(h(Parent));
      assert.equal(
        container.innerHTML,
        '<div><button id="parent">0</button><button id="child">0</button></div>'
      );
      assert.equal(parentRenderCount, 1);
      assert.equal(childRenderCount, 1);

      // Trigger a state update in both the child and the parent. When state
      // updates are flushed the parent should be re-rendered first since it
      // is nearer to the root of the tree. This should re-render the child and
      // remove it from the set of components to re-render. As a result, both
      // the parent and child should only be re-rendered once.
      act(() => {
        container.querySelector("#child").click();
        container.querySelector("#parent").click();
      });

      assert.equal(
        container.innerHTML,
        '<div><button id="parent">1</button><button id="child">1</button></div>'
      );
      assert.equal(parentRenderCount, 2);
      assert.equal(childRenderCount, 2);
    });
  });

  describe("unmountComponentAtNode", () => {
    it("removes DOM output and returns true if component is mounted in node", () => {
      function Widget() {
        return h("button", {}, "Click me");
      }

      const container = scratch.render(h(Widget));
      assert.equal(container.innerHTML, "<button>Click me</button>");

      const result = unmountComponentAtNode(container);

      assert.equal(result, true);
      assert.equal(container.innerHTML, "");
    });

    it("returns `false` no component is mounted in node", () => {
      const container = scratch.document.createElement("div");
      assert.equal(unmountComponentAtNode(container), false);
    });
  });

  describe("error handling during render", () => {
    const BrokenChild = ({ id = "child" }) => {
      throw new Error(`Error in ${id}`);
    };

    it("renders nothing if an error occurs during render", () => {
      const App = () => {
        return h("ul", {}, h(BrokenChild));
      };

      assert.throws(() => {
        scratch.render(h(App));
      }, "Error in child");

      assert.equal(scratch.container.innerHTML, "");
    });

    it("only reports the first error in a render", () => {
      const App = () => {
        return h(
          "ul",
          {},
          h(BrokenChild, { id: "child-a" }),
          h(BrokenChild, { id: "child-b" })
        );
      };

      assert.throws(() => {
        scratch.render(h(App));
      }, "Error in child-a");

      assert.equal(scratch.container.innerHTML, "");
    });

    it("invokes the nearest error boundary", () => {
      let handledError;
      const App = () => {
        const [error, setError] = useState(null);
        const handler = (err) => {
          handledError = err;
          setError(err);
        };

        return error
          ? `Something went wrong: ${error.message}`
          : h(ErrorBoundary, { handler }, h(BrokenChild));
      };

      act(() => {
        scratch.render(h(App));
      });

      assert.instanceOf(handledError, Error);
      assert.equal(
        scratch.container.innerHTML,
        "Something went wrong: Error in child"
      );
    });

    it("handles an error during the error boundary", () => {
      const BrokenBoundary = () => {
        const handler = () => {
          throw new Error("Error from BrokenBoundary");
        };
        return h(ErrorBoundary, { handler }, h(BrokenChild));
      };

      const App = () => {
        const [error, setError] = useState(null);
        return error
          ? `Something went wrong: ${error.message}`
          : h(ErrorBoundary, { handler: setError }, h(BrokenBoundary));
      };

      act(() => {
        scratch.render(h(App));
      });

      assert.equal(
        scratch.container.innerHTML,
        "Something went wrong: Error from BrokenBoundary"
      );
    });

    it("renders other subtrees when one subtree has an error", () => {
      const WorkingChild = () => h("div", {}, "This part is OK");
      const Boundary = () => {
        const [error, setError] = useState(null);
        return error
          ? h("div", {}, "Subtree with error")
          : h(ErrorBoundary, { handler: setError }, h(BrokenChild));
      };
      const App = () => {
        return h("div", {}, h(Boundary), h(WorkingChild));
      };

      act(() => {
        scratch.render(h(App));
      });

      assert.equal(
        scratch.container.innerHTML,
        "<div><div>Subtree with error</div><div>This part is OK</div></div>"
      );
    });

    it("invokes only the nearest error boundary when there are multiple in a tree", () => {
      const log = [];

      const Child = () => {
        const handler = (err) => {
          log.push(`Child boundary: ${err.message}`);
        };
        return h(ErrorBoundary, { handler }, h(BrokenChild));
      };

      const App = () => {
        const handler = (err) => {
          log.push(`App boundary: ${err.message}`);
        };
        return h(ErrorBoundary, { handler }, h(Child));
      };

      act(() => {
        scratch.render(h(App));
      });

      assert.deepEqual(log, ["Child boundary: Error in child"]);
    });
  });
});
