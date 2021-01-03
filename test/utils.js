import chai from "chai";
import * as sinon from "sinon";
const { assert } = chai;

import {
  createElement as h,
  render,
  Fragment,
  createRef,
  memo,
} from "../build/index.js";

import { createScratchpad } from "./utils/scratchpad.js";

describe("utilities", () => {
  const scratch = createScratchpad();

  beforeEach(() => {
    scratch.reset();
  });

  after(() => {
    scratch.cleanup();
  });

  describe("Fragment", () => {
    it("renders children", () => {
      const container = scratch.render(
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

      const container = scratch.render(
        h(Component, { firstName: "Jim", lastName: "Smith" })
      );
      assert.equal(renderCount, 1);
      assert.equal(container.innerHTML, "<div>Hello Jim Smith</div>");

      // Re-render with same props.
      scratch.render(h(Component, { firstName: "Jim", lastName: "Smith" }));
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
      scratch.render(h(Component, { firstName: "Jim", lastName: "Smith" }));
      assert.equal(renderCount, 3);

      // Re-render with changed prop.
      scratch.render(h(Component, { firstName: "Jim", lastName: "Jones" }));
      assert.equal(renderCount, 4);
      assert.equal(container.innerHTML, "<div>Hello Jim Jones</div>");
    });
  });
});
