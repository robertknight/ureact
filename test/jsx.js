const { assert } = require("chai");

const { createElement } = require("../build");

describe("JSX", () => {
  describe("createElement", () => {
    it("creates a DOM VNode", () => {
      const vnode = createElement("div", { someProp: "someValue" });
      assert.deepEqual(vnode, {
        type: "div",
        props: { someProp: "someValue" },
        key: null,
      });
    });

    it("sets `children` prop", () => {
      const vnode = createElement("div", {}, "childA", "childB");
      assert.deepEqual(vnode, {
        type: "div",
        props: { children: ["childA", "childB"] },
        key: null,
      });
    });

    it("sets key", () => {
      const vnode = createElement("div", {
        key: "aKey",
        otherProp: "testValue",
      });
      assert.deepEqual(vnode, {
        type: "div",
        props: { otherProp: "testValue" },
        key: "aKey",
      });
    });
  });
});
