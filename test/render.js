const { assert } = require("chai");
const sinon = require("sinon");

const { JSDOM } = require("jsdom");

const { createElement: h, render } = require("../build/index");

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

    it("ignores `false` children", () => {
      const container = testRender(h("p", {}, "Hello", false, " world"));
      assert.equal(container.innerHTML, "<p>Hello world</p>");
    });

    it("ignores `null` children", () => {
      const container = testRender(h("p", {}, "Hello", null, " world"));
      assert.equal(container.innerHTML, "<p>Hello world</p>");
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
});
