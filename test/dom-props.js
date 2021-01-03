import chai from "chai";
import sinon from "sinon";
const { assert } = chai;

import { createElement as h } from "../build/index.js";

import { createScratchpad } from "./utils/scratchpad.js";

describe("DOM properties, attribute & event listeners", () => {
  const scratch = createScratchpad();

  beforeEach(() => {
    scratch.reset();
  });

  after(() => {
    scratch.cleanup();
  });

  describe("initial render", () => {
    it("sets element properties", () => {
      const container = scratch.render(h("a", { href: "https://example.com" }));
      assert.equal(container.innerHTML, '<a href="https://example.com"></a>');
    });

    it("sets attributes", () => {
      const container = scratch.render(h("div", { customAttr: "test-value" }));
      assert.equal(container.innerHTML, '<div customattr="test-value"></div>');
    });

    [
      {
        element: "button",
        propName: "onClick",
        eventName: "click",
      },
      {
        element: "input",
        propName: "onInput",
        eventName: "input",
      },
    ].forEach(({ element, propName, eventName }) => {
      it(`sets event listeners (${propName})`, () => {
        const handler = sinon.stub();
        const container = scratch.render(h(element, { [propName]: handler }));
        const button = container.querySelector(element);

        const event = new scratch.window.Event(eventName);
        button.dispatchEvent(event);

        sinon.assert.calledOnce(handler);
        sinon.assert.calledWith(handler, event);
      });
    });
  });

  describe("re-rendering", () => {
    it("updates properties of existing element", () => {
      const container = scratch.render(
        h("a", { href: "https://example.org/" })
      );
      const child = container.firstChild;

      assert.equal(child.href, "https://example.org/");

      scratch.render(h("a", { href: "https://foobar.com/" }));

      assert.equal(container.firstChild, child);
      assert.equal(child.href, "https://foobar.com/");
    });

    it("removes properties that are no longer present", () => {
      const container = scratch.render(
        h("a", { href: "https://example.org/", tabIndex: 42 })
      );
      const child = container.firstChild;

      assert.equal(child.tabIndex, 42);

      scratch.render(h("a", { href: "https://foobar.com/" }));

      assert.equal(child.tabIndex, 0);
    });

    it("updates attributes of existing element", () => {
      const container = scratch.render(h("div", { someAttr: 1 }));
      const child = container.firstChild;

      assert.equal(child.getAttribute("someAttr"), "1");

      scratch.render(h("div", { someAttr: 2 }));

      assert.equal(container.firstChild, child);
      assert.equal(child.getAttribute("someAttr"), "2");
    });

    it("removes attributes that are no longer present", () => {
      const container = scratch.render(h("div", { someAttr: 1 }));
      const child = container.firstChild;

      assert.equal(child.getAttribute("someAttr"), "1");

      scratch.render(h("div"));

      assert.equal(container.firstChild, child);
      assert.equal(child.getAttribute("someAttr"), null);
    });

    it("updates event listeners of existing element", () => {
      const callback1 = sinon.stub();
      const callback2 = sinon.stub();

      const container = scratch.render(h("button", { onClick: callback1 }));

      container.firstChild.click();
      sinon.assert.calledOnce(callback1);

      scratch.render(h("button", { onClick: callback2 }));
      container.firstChild.click();

      sinon.assert.calledOnce(callback1);
      sinon.assert.calledOnce(callback2);
    });

    it("removes event listeners that are no longer present", () => {
      const callback = sinon.stub();

      const container = scratch.render(h("button", { onClick: callback }));

      container.firstChild.click();
      sinon.assert.calledOnce(callback);

      callback.resetHistory();
      scratch.render(h("button"));
      container.firstChild.click();

      sinon.assert.notCalled(callback);
    });
  });

  describe("custom element properties", () => {
    let CustomWidget;

    before(() => {
      CustomWidget = class CustomWidget extends scratch.window.HTMLElement {
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
      scratch.window.customElements.define("custom-widget", CustomWidget);
    });

    it("sets custom DOM element properties", () => {
      const container = scratch.render(
        h("custom-widget", { someProperty: 42 })
      );
      assert.equal(container.firstChild.someProperty, 42);
      assert.equal(
        container.innerHTML,
        `<custom-widget some-property="42"></custom-widget>`
      );
    });
  });

  describe("custom events", () => {
    ["lowercase", "camelCase", "PascalCase", "kebab-case"].forEach(
      (eventName) => {
        it(`can listen to custom events (${eventName})`, () => {
          const callback = sinon.stub();
          const container = scratch.render(
            h("custom-widget", { ["on" + eventName]: callback })
          );

          const event = new scratch.window.Event(eventName);
          container.firstChild.dispatchEvent(event);

          sinon.assert.calledWith(callback, event);
        });
      }
    );
  });
});
