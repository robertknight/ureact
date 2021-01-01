const { assert } = require("chai");

const { elementSymbol } = require("../build/jsx");
const { createElement, isValidElement } = require("../build");

describe("JSX", () => {
  describe("createElement", () => {
    it("creates a DOM VNode", () => {
      const vnode = createElement("div", { someProp: "someValue" });
      assert.deepEqual(vnode, {
        _tag: elementSymbol,
        type: "div",
        props: { someProp: "someValue" },
        key: null,
        ref: null,
      });
    });

    it("sets `children` prop to third arg if there are exactly 3 args", () => {
      const vnode = createElement("div", {}, "child");
      assert.deepEqual(vnode, {
        _tag: elementSymbol,
        type: "div",
        props: { children: "child" },
        key: null,
        ref: null,
      });
    });

    it("sets `children` prop to array if there are more than 3 args", () => {
      const vnode = createElement("div", {}, "childA", "childB");
      assert.deepEqual(vnode, {
        _tag: elementSymbol,
        type: "div",
        props: { children: ["childA", "childB"] },
        key: null,
        ref: null,
      });
    });

    it("sets key", () => {
      const vnode = createElement("div", {
        key: "aKey",
        otherProp: "testValue",
      });
      assert.deepEqual(vnode, {
        _tag: elementSymbol,
        type: "div",
        props: { otherProp: "testValue" },
        key: "aKey",
        ref: null,
      });
    });

    it("sets ref", () => {
      const ref = {};
      const vnode = createElement("div", {
        ref,
        otherProp: "testValue",
      });
      assert.deepEqual(vnode, {
        _tag: elementSymbol,
        type: "div",
        props: { otherProp: "testValue" },
        key: null,
        ref,
      });
    });
  });

  describe("isValidElement", () => {
    it("returns `true` for a VDOM node", () => {
      assert.isTrue(isValidElement(createElement("div")));
    });

    [
      null,
      undefined,
      true,
      false,
      42,
      Symbol.for("bar"),
      () => {},
      {},
      { type: "div" },
    ].forEach((val) => {
      it(`returns false for a non-VDOM node (${typeof val})`, () => {
        assert.isFalse(isValidElement(val));
      });
    });
  });
});
