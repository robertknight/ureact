const { assert } = require("chai");
const sinon = require("sinon");
const { JSDOM } = require("jsdom");

const { createElement: h, render } = require("../build/index");

const { testRender } = require("./test-utils");

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
  let jsdom;
  let document;

  before(() => {
    jsdom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    document = jsdom.window.document;
  });

  after(() => {
    jsdom.window.close();
  });

  const testRender = (vnode) => {
    const container = document.createElement("div");
    render(vnode, container);
    return container;
  };

  describe("empty VNode rendering", () => {
    nullishValues.forEach((value) => {
      it(`"${value}" renders nothing`, () => {
        const container = testRender(null);
        assert.equal(container.innerHTML, "");
      });
    });
  });

  describe("DOM text rendering", () => {
    it("renders a text node", () => {
      const container = testRender("Hello world");
      assert.equal(container.innerHTML, "Hello world");
    });

    it("updates a text node", () => {
      const container = testRender("Hello world");
      const text = container.firstChild;
      render("Goodbye", container);
      assert.equal(text.data, "Goodbye");
    });
  });

  describe("DOM element rendering", () => {
    it("creates a DOM element", () => {
      const container = testRender(h("span"));
      assert.equal(container.innerHTML, "<span></span>");
    });

    it("sets element properties", () => {
      const container = testRender(h("a", { href: "https://example.com" }));
      assert.equal(container.innerHTML, '<a href="https://example.com"></a>');
    });

    it("sets attributes", () => {
      const container = testRender(h("div", { customAttr: "test-value" }));
      assert.equal(container.innerHTML, '<div customattr="test-value"></div>');
    });

    it("sets event listeners", () => {
      const onClick = sinon.stub();
      const container = testRender(h("button", { onClick }));
      const button = container.querySelector("button");

      const event = new jsdom.window.Event("click");
      button.dispatchEvent(event);

      sinon.assert.calledOnce(onClick);
      sinon.assert.calledWith(onClick, event);
    });

    it("sets `ref` prop to DOM node", () => {
      const ref = {};
      const container = testRender(h("div", { ref }));
      assert.equal(container.innerHTML, "<div></div>");
      assert.equal(ref.current, container.firstChild);
    });

    it("unsets `ref` when DOM component is unmounted", () => {
      const ref = {};
      const container = testRender(h("div", { ref }));
      assert.equal(ref.current, container.firstChild);
      render(h(null), container);
      assert.equal(ref.current, null);
    });
  });

  describe("custom DOM element rendering", () => {
    let CustomWidget;

    before(() => {
      CustomWidget = class CustomWidget extends jsdom.window.HTMLElement {
        constructor() {
          super();
          this._someProperty = 0;
        }

        get someProperty() {
          return this._someProperty;
        }

        set someProperty(val) {
          this._someProperty = val;
          this.setAttribute("some-property", val);
        }
      };
      jsdom.window.customElements.define("custom-widget", CustomWidget);
    });

    it("creates a custom DOM element", () => {
      const container = testRender(h("custom-widget"));
      assert.equal(container.innerHTML, "<custom-widget></custom-widget>");
      assert.isTrue(container.firstChild instanceof CustomWidget);
    });

    it("sets custom DOM element properties", () => {
      const container = testRender(h("custom-widget", { someProperty: 42 }));
      assert.equal(container.firstChild.someProperty, 42);
      assert.equal(
        container.innerHTML,
        `<custom-widget some-property="42"></custom-widget>`
      );
    });

    ["lowercase", "camelCase", "PascalCase", "kebab-case"].forEach(
      (eventName) => {
        it(`can listen to custom events (${eventName})`, () => {
          const callback = sinon.stub();
          const container = testRender(
            h("custom-widget", { ["on" + eventName]: callback })
          );

          const event = new jsdom.window.Event(eventName);
          container.firstChild.dispatchEvent(event);

          sinon.assert.calledWith(callback, event);
        });
      }
    );
  });

  describe("DOM element child rendering", () => {
    it("renders element child", () => {
      const container = testRender(h("p", {}, h("b", {})));
      assert.equal(container.innerHTML, "<p><b></b></p>");
    });

    it("renders array of element children", () => {
      const container = testRender(h("p", {}, h("b", {}), h("i", {})));
      assert.equal(container.innerHTML, "<p><b></b><i></i></p>");
    });

    it("renders text child", () => {
      const container = testRender(h("p", {}, "Hello world"));
      assert.equal(container.innerHTML, "<p>Hello world</p>");
    });

    it("renders number child", () => {
      const container = testRender(h("p", {}, 42));
      assert.equal(container.innerHTML, "<p>42</p>");
    });

    it("renders array of text children", () => {
      const container = testRender(h("p", {}, "Hello", " ", "world"));
      assert.equal(container.innerHTML, "<p>Hello world</p>");
    });

    nullishValues.forEach((value) => {
      it(`ignores nullish children (${value})`, () => {
        const container = testRender(h("p", {}, "Hello", value, " world"));
        assert.equal(container.innerHTML, "<p>Hello world</p>");
      });
    });

    it("renders array children", () => {
      const items = ["Item 1", "Item 2", "Item 3"];
      const container = testRender(
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
        testRender(h("ul", {}, "One", {}, "Two"));
      }, "Object is not a valid element");
    });
  });

  describe("DOM element re-rendering", () => {
    it("updates properties of existing element", () => {
      const container = testRender(h("a", { href: "https://example.org/" }));
      const child = container.firstChild;

      assert.equal(child.href, "https://example.org/");

      render(h("a", { href: "https://foobar.com/" }), container);

      assert.equal(container.firstChild, child);
      assert.equal(child.href, "https://foobar.com/");
    });

    it("removes properties that are no longer present", () => {
      const container = testRender(
        h("a", { href: "https://example.org/", tabIndex: 42 })
      );
      const child = container.firstChild;

      assert.equal(child.tabIndex, 42);

      render(h("a", { href: "https://foobar.com/" }), container);

      assert.equal(child.tabIndex, 0);
    });

    it("updates attributes of existing element", () => {
      const container = testRender(h("div", { someAttr: 1 }));
      const child = container.firstChild;

      assert.equal(child.getAttribute("someAttr"), "1");

      render(h("div", { someAttr: 2 }), container);

      assert.equal(container.firstChild, child);
      assert.equal(child.getAttribute("someAttr"), "2");
    });

    it("removes attributes that are no longer present", () => {
      const container = testRender(h("div", { someAttr: 1 }));
      const child = container.firstChild;

      assert.equal(child.getAttribute("someAttr"), "1");

      render(h("div"), container);

      assert.equal(container.firstChild, child);
      assert.equal(child.getAttribute("someAttr"), null);
    });

    it("updates event listeners of existing element", () => {
      const callback1 = sinon.stub();
      const callback2 = sinon.stub();

      const container = testRender(h("button", { onClick: callback1 }));

      container.firstChild.click();
      sinon.assert.calledOnce(callback1);

      render(h("button", { onClick: callback2 }), container);
      container.firstChild.click();

      sinon.assert.calledOnce(callback1);
      sinon.assert.calledOnce(callback2);
    });

    it("removes event listeners that are no longer present", () => {
      const callback = sinon.stub();

      const container = testRender(h("button", { onClick: callback }));

      container.firstChild.click();
      sinon.assert.calledOnce(callback);

      callback.resetHistory();
      render(h("button"), container);
      container.firstChild.click();

      sinon.assert.notCalled(callback);
    });

    it("updates child text nodes", () => {
      const container = testRender(h("div", {}, "Hello ", "world"));

      const textNodes = [...container.firstChild.childNodes];
      render(h("div", {}, "Goodbye ", "everyone"), container);

      assert.equal(container.innerHTML, "<div>Goodbye everyone</div>");
      const newTextNodes = [...container.firstChild.childNodes];
      assert.deepEqual(textNodes, newTextNodes);
    });

    it("updates unkeyed children", () => {
      const container = testRender(
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
      const container = testRender(
        h("div", {}, "Hello ", h("b", {}, "brave new"), "world")
      );
      render(h("div", {}, "Hello ", "world"), container);
      assert.equal(container.innerHTML, "<div>Hello world</div>");
    });

    it("removes text children that are no longer present", () => {
      const container = testRender(
        h("div", {}, "Hello ", "brave new ", "world")
      );
      render(h("div", {}, "Hello ", "world"), container);
      assert.equal(container.innerHTML, "<div>Hello world</div>");
    });

    it("updates children with matching key", () => {
      const container = testRender(
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
      const container = testRender(
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
      const container = testRender(
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
      const container = testRender(
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
      const container = testRender(h("p", {}, h("i", {}, "Hello")));
      render(h("p", {}, h("b", {}, "Hello")), container);
      assert.equal(container.innerHTML, "<p><b>Hello</b></p>");
    });

    nullishValues.forEach((nullishValue) => {
      it("removes a conditionally rendered child if condition changes to false", () => {
        const container = testRender(h("p", {}, h("i", {}, "Hello")));
        render(h("p", {}, nullishValue), container);
        assert.equal(container.innerHTML, "<p></p>");
      });
    });
  });

  function Button({ label }) {
    return h("button", {}, label);
  }

  describe("custom component rendering", () => {
    it("renders a custom component", () => {
      const container = testRender(h(Button, { label: "Click me" }));
      assert.equal(container.innerHTML, "<button>Click me</button>");
    });

    nullishValues.forEach((nullishValue) => {
      it(`renders a custom component that returns ${nullishValue}`, () => {
        const EmptyComponent = () => nullishValue;
        const container = testRender(h(EmptyComponent));
        assert.equal(container.innerHTML, "");
      });
    });

    it("renders a custom component that returns a string", () => {
      const TextComponent = ({ text }) => text;
      const container = testRender(h(TextComponent, { text: "Hello world" }));
      assert.equal(container.innerHTML, "Hello world");
    });

    it("renders a custom component that returns an array", () => {
      const ArrayComponent = () => ["Hello ", "world"];
      const container = testRender(h(ArrayComponent));
      assert.equal(container.innerHTML, "Hello world");
    });

    it("renders a custom component with children", () => {
      function Button({ children }) {
        return h("button", {}, children);
      }
      const container = testRender(h(Button, {}, "Click me"));
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
      const container = testRender(h(Parent));
      assert.equal(
        container.innerHTML,
        "<div><button>First</button><button>Second</button></div>"
      );
    });

    it("renders a deeply nested tree of custom components", () => {
      const ThirdLevel = ({ children }) => h("p", {}, children);
      const SecondLevel = ({ children }) => h(ThirdLevel, {}, children);
      const FirstLevel = ({ children }) => h(SecondLevel, {}, children);

      const container = testRender(h(FirstLevel, {}, "Hello world"));

      assert.equal(container.innerHTML, "<p>Hello world</p>");
    });
  });

  describe("custom component re-rendering", () => {
    it("updates a custom component", () => {
      const container = testRender(h(Button, { label: "Click me" }));
      render(h(Button, { label: "Updated" }), container);
      assert.equal(container.innerHTML, "<button>Updated</button>");
    });

    it("updates a custom component that returns text", () => {
      const TextComponent = ({ children }) => children;
      const container = testRender(h(TextComponent, {}, "One"));
      assert.equal(container.innerHTML, "One");

      render(h(TextComponent, {}, "Two"), container);
      assert.equal(container.innerHTML, "Two");

      render(h(TextComponent, {}, "Three"), container);
      assert.equal(container.innerHTML, "Three");
    });

    it("updates a custom component that returns null", () => {
      const EmptyComponent = () => null;
      const container = testRender(h(EmptyComponent));

      render(h(EmptyComponent), container);
      render(h(EmptyComponent), container);

      assert.equal(container.innerHTML, "");
    });

    it("updates a custom component with children", () => {
      function Button({ children }) {
        return h("button", {}, children);
      }
      const container = testRender(h(Button, {}, "Click me"));
      render(h(Button, {}, "Updated"), container);
      assert.equal(container.innerHTML, "<button>Updated</button>");
    });

    it("updates a custom component that returns an array", () => {
      const List = ({ items }) => items.map((item) => h("li", {}, item));
      const container = testRender(h(List, { items: ["One", "two"] }));
      render(h(List, { items: ["Three", "four", "five"] }), container);
      assert.equal(
        container.innerHTML,
        "<li>Three</li><li>four</li><li>five</li>"
      );
    });

    it("updates positions of keyed custom component children", () => {
      function Button({ children }) {
        return h("button", {}, children);
      }
      const container = testRender(
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
      const container = testRender(
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
  });
});
