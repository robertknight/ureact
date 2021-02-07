import chai from "chai";
const { assert } = chai;

import { elementSymbol } from "../build/jsx.js";
import { createElement, jsx, isValidElement } from "../build/index.js";

describe("JSX", () => {
  // `jsx` is the same as `createElement` except for the handling of `children`
  // and `key`, so most functionality is covered by `createElement` tests below.
  describe("jsx", () => {
    it("extracts ref from props", () => {
      const aRef = { current: null };
      const vnode = jsx("div", { someProp: "someValue", ref: aRef });
      assert.deepEqual(vnode, {
        _tag: elementSymbol,
        type: "div",
        props: { someProp: "someValue" },
        key: null,
        ref: aRef,
      });
    });

    it("sets key to `null` if missing", () => {
      const vnode = jsx("div", { someProp: "someValue" });
      assert.deepEqual(vnode, {
        _tag: elementSymbol,
        type: "div",
        props: { someProp: "someValue" },
        key: null,
        ref: null,
      });
    });

    it("removes `__source` and `__self` props", () => {
      const vnode = jsx("div", { __source: "the-source", __self: "the-self" });
      assert.deepEqual(vnode, {
        _tag: elementSymbol,
        type: "div",
        props: {},
        key: null,
        ref: null,
      });
    });
  });

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

    [null, undefined].forEach((props) => {
      it("allows `props` argument to be `null` or `undefined`", () => {
        const vnode = createElement("div", props);
        assert.deepEqual(vnode, {
          _tag: elementSymbol,
          type: "div",
          props: {},
          key: null,
          ref: null,
        });
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
