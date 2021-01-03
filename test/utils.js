import chai from "chai";
import * as sinon from "sinon";
import { JSDOM } from "jsdom";
const { assert } = chai;

import {
  createElement as h,
  render,
  Fragment,
  createRef,
  memo,
} from "../build/index.js";

describe("utilities", () => {
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

  describe("Fragment", () => {
    it("renders children", () => {
      const container = testRender(
        h(
          Fragment,
          {},
          h("div", {}, "One"),
          h("div", {}, "Two"),
          h("div", {}, "Three")
        )
      );
      assert.equal(
        container.innerHTML,
        "<div>One</div><div>Two</div><div>Three</div>"
      );
    });
  });

  describe("createRef", () => {
    it("returns a value that can be used as a `ref` prop", () => {
      const ref = createRef();
      assert.deepEqual(ref, { current: null });
    });
  });

  describe("memo", () => {
    it("sets display name of wrapper", () => {
      const Component = memo(function Component({ firstName, lastName }) {
        return h("div", {}, "Hello ", firstName, " ", lastName);
      });
      assert.equal(Component.displayName, "memo(Component)");
    });

    it("bails out of updates if props are shallow-equal", () => {
      let renderCount = 0;
      const Component = memo(function Component({ firstName, lastName }) {
        ++renderCount;
        return h("div", {}, "Hello ", firstName, " ", lastName);
      });

      const container = testRender(
        h(Component, { firstName: "Jim", lastName: "Smith" })
      );
      assert.equal(renderCount, 1);
      assert.equal(container.innerHTML, "<div>Hello Jim Smith</div>");

      // Re-render with same props.
      render(h(Component, { firstName: "Jim", lastName: "Smith" }), container);
      assert.equal(container.innerHTML, "<div>Hello Jim Smith</div>");
      assert.equal(renderCount, 1);

      // Re-render with an added prop.
      render(
        h(Component, {
          firstName: "Jim",
          lastName: "Smith",
          extra: "ignoreme",
        }),
        container
      );
      assert.equal(renderCount, 2);

      // Re-render with removed prop.
      render(h(Component, { firstName: "Jim", lastName: "Smith" }), container);
      assert.equal(renderCount, 3);

      // Re-render with changed prop.
      render(h(Component, { firstName: "Jim", lastName: "Jones" }), container);
      assert.equal(renderCount, 4);
      assert.equal(container.innerHTML, "<div>Hello Jim Jones</div>");
    });
  });
});
