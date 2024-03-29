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
      // Set the property.
      const container = scratch.render(h("a", { href: "https://example.com" }));
      assert.equal(container.innerHTML, '<a href="https://example.com"></a>');

      // Update it and make sure that it was set via a property rather than an
      // attribute.
      const link = container.querySelector("a");
      sinon.stub(link, "setAttribute");
      scratch.render(h("a", { href: "https://example.org" }));

      assert.equal(container.innerHTML, '<a href="https://example.org"></a>');
      sinon.assert.notCalled(link.setAttribute);
    });

    it("sets element properties inherited from a base class", () => {
      const container = scratch.render(h("a", { className: "foo" }));
      assert.equal(container.innerHTML, '<a class="foo"></a>');

      // Update it and make sure that it was set via a property rather than an
      // attribute.
      const el = container.querySelector("a");
      sinon.stub(el, "setAttribute");
      scratch.render(h("a", { className: "bar" }));

      assert.equal(container.innerHTML, '<a class="bar"></a>');
      sinon.assert.notCalled(el.setAttribute);
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

    it("adds bubble-phase event listener if prop does not have a `Capture` suffix", () => {
      const handler = sinon.spy((e) => {
        assert.equal(e.eventPhase, 3 /* Event.BUBBLING_PHASE */);
      });
      const container = scratch.render(
        h("div", { onClick: handler }, h("button", {}, "Click me"))
      );
      const button = container.querySelector("button");
      const event = new scratch.window.Event("click", { bubbles: true });

      button.dispatchEvent(event);

      sinon.assert.calledWith(handler, event);
    });

    it("adds capture-phase event listener if prop has `Capture` suffix", () => {
      const handler = sinon.spy((e) => {
        assert.equal(e.eventPhase, 1 /* Event.CAPTURING_PHASE */);
      });
      const container = scratch.render(
        h("div", { onClickCapture: handler }, h("button", {}, "Click me"))
      );
      const button = container.querySelector("button");
      const event = new scratch.window.Event("click", { bubbles: true });

      button.dispatchEvent(event);

      sinon.assert.calledWith(handler, event);
    });

    it("sets inline styles", () => {
      const container = scratch.render(
        h("div", {
          style: {
            backgroundColor: "white",
            fontSize: "12pt",
          },
        })
      );

      const css = container.firstChild.style.cssText;
      assert.equal(css, "background-color: white; font-size: 12pt;");
    });

    it("sets custom HTML", () => {
      const container = scratch.render(
        h("div", {
          dangerouslySetInnerHTML: {
            __html: "<span>Custom markup</span>",
          },
        })
      );
      assert.equal(
        container.innerHTML,
        "<div><span>Custom markup</span></div>"
      );
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

    it("removes a generic element property that is no longer present", () => {
      const container = scratch.render(
        h("a", { href: "https://example.org/", tabIndex: 42 })
      );
      const child = container.firstChild;

      assert.equal(child.tabIndex, 42);

      scratch.render(h("a", { href: "https://foobar.com/" }));

      assert.equal(child.tabIndex, 0);
    });

    it("removes an element type-specific property that is no longer present", () => {
      const container = scratch.render(
        h("a", { href: "https://example.org/", tabIndex: 42 })
      );
      const child = container.firstChild;

      assert.equal(child.href, "https://example.org/");

      scratch.render(h("a", { tabIndex: 42 }));

      assert.equal(child.href, "");
    });

    it("does not modify properties that did not change", () => {
      const container = scratch.render(
        h("a", { href: "https://example.org/" })
      );
      const child = container.firstChild;
      assert.equal(child.href, "https://example.org/");

      // Manually modify property so we can check if the next render changes it.
      child.href = "https://manually-modified.org/";

      scratch.render(h("a", { href: "https://example.org/" }));
      assert.equal(child.href, "https://manually-modified.org/");
    });

    it("modifies properties that did change if others did not", () => {
      const container = scratch.render(
        h("a", { "aria-label": "test", href: "https://example.org/" })
      );
      const child = container.firstChild;
      assert.equal(child.href, "https://example.org/");

      // Re-render with an unchanged prop followed by a changed prop.
      scratch.render(
        h("a", { "aria-label": "test", href: "https://updated.org/" })
      );
      assert.equal(child.href, "https://updated.org/");
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

    it("removes capture-phase event listeners that are no longer present", () => {
      const handler = sinon.stub();
      const container = scratch.render(
        h("div", {}, h("button", { onClickCapture: handler }, "Click me"))
      );
      const button = container.querySelector("button");

      scratch.render(h("div", {}, h("button", {}, "Click me")));
      const event = new scratch.window.Event("click");
      button.dispatchEvent(event);

      sinon.assert.notCalled(handler);
    });

    it("updates inline styles if `style` prop changed", () => {
      const container = scratch.render(
        h("div", {
          style: {
            backgroundColor: "white",
            fontSize: "12pt",
          },
        })
      );
      const style = container.firstChild.style;

      scratch.render(
        h("div", {
          style: {
            // fontSize removed.
            backgroundColor: "green", // Updated
            fontWeight: "bold", // Added
          },
        })
      );

      const css = container.firstChild.style.cssText;
      assert.equal(css, "background-color: green; font-weight: bold;");
    });

    it("removes inline styles if `style` prop is removed", () => {
      const container = scratch.render(
        h("div", {
          style: {
            backgroundColor: "white",
            fontSize: "12pt",
          },
        })
      );
      const style = container.firstChild.style;
      assert.notEqual(style.cssText, "");

      scratch.render(h("div"));
      assert.equal(style.cssText, "");
    });

    it("does not update inline styles if `style` prop did not change", () => {
      const container = scratch.render(
        h("div", {
          style: {
            backgroundColor: "white",
            fontSize: "12pt",
          },
        })
      );
      const style = container.firstChild.style;

      // Manually change the styles, do we can tell if the next render modifies
      // them.
      style.cssText = "font-weight: bold;";

      // Re-render with the same styles as the previous render. The inline styles
      // should not be updated.
      scratch.render(
        h("div", {
          style: {
            backgroundColor: "white",
            fontSize: "12pt",
          },
        })
      );

      assert.equal(style.cssText, "font-weight: bold;");
    });

    it("sets inline style properties to pixel values if property supports pixels", () => {
      const container = scratch.render(
        h("div", {
          style: {
            flexGrow: 1,
            fontSize: 12,
            top: 5,
          },
        })
      );
      const style = container.firstChild.style;

      // Properties that should be set to pixel values.
      assert.equal(style.fontSize, "12px");
      assert.equal(style.top, "5px");

      // Properties that should not be set to pixel values.
      assert.equal(style.flexGrow, "1");
    });

    it("updates inline style properties with pixel values", () => {
      const container = scratch.render(
        h("div", {
          style: { top: 5, flexGrow: 1 },
        })
      );

      scratch.render(h("div", { style: { top: 10, flexGrow: 2 } }));

      const style = container.firstChild.style;
      assert.equal(style.top, "10px");
      assert.equal(style.flexGrow, "2");
    });

    it("updates custom HTML", () => {
      const container = scratch.render(
        h("div", {
          dangerouslySetInnerHTML: {
            __html: "<span>Custom markup</span>",
          },
        })
      );
      scratch.render(
        h("div", {
          dangerouslySetInnerHTML: {
            __html: "<span>New custom markup</span>",
          },
        })
      );
      assert.equal(
        container.innerHTML,
        "<div><span>New custom markup</span></div>"
      );
    });

    it("does not update custom HTML if HTML string is unchanged", () => {
      const container = scratch.render(
        h("div", {
          dangerouslySetInnerHTML: {
            __html: "<span>Custom markup</span>",
          },
        })
      );

      container.firstChild.innerHTML = "Manually modified";

      scratch.render(
        h("div", {
          dangerouslySetInnerHTML: {
            __html: "<span>Custom markup</span>",
          },
        })
      );

      assert.equal(container.innerHTML, "<div>Manually modified</div>");
    });

    it("removes custom HTML", () => {
      const container = scratch.render(
        h("div", {
          dangerouslySetInnerHTML: {
            __html: "<span>Custom markup</span>",
          },
        })
      );
      scratch.render(h("div"));
      assert.equal(container.innerHTML, "<div></div>");
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

  describe("SVG element props", () => {
    it("maps `className` prop to `class` attribute", () => {
      const container = scratch.render(h("svg", { className: "test-class" }));
      assert.equal(container.innerHTML, '<svg class="test-class"></svg>');
    });

    it("sets attributes rather than properties", () => {
      const container = scratch.render(h("svg", { width: 10, height: 20 }));
      assert.equal(container.innerHTML, '<svg width="10" height="20"></svg>');
    });

    it("unsets attributes when props are removed", () => {
      const container = scratch.render(h("svg", { width: 10, height: 20 }));
      scratch.render(h("svg", { height: 20 }));
      assert.equal(container.innerHTML, '<svg height="20"></svg>');
    });
  });
});
