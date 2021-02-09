import chai from "chai";
const { assert } = chai;

import { elementSymbol } from "../build/jsx.js";
import { createElement, isValidElement } from "../build/index.js";
import { jsx } from "../build/jsx-runtime.js";
import { jsxDEV } from "../build/jsx-dev-runtime.js";

describe("JSX", () => {
  describe("jsx", () => {
    it("returns JSX element", () => {
      const el = jsx("a", { href: "https://example.com" }, "a-key");
      assert.deepEqual(el, {
        $$typeof: elementSymbol,
        type: "a",
        props: { href: "https://example.com" },
        key: "a-key",
      });
    });
  });

  describe("jsxDEV", () => {
    it("returns JSX element", () => {
      const source = { fileName: "foobar.js", fileNumber: 1, columnNumber: 2 };
      const self = {};

      const el = jsxDEV(
        "a",
        { href: "https://example.com" },
        "a-key",
        false /* isStaticChildren */,
        source,
        self
      );

      assert.deepEqual(el, {
        $$typeof: elementSymbol,
        type: "a",
        props: { href: "https://example.com" },
        key: "a-key",
        source,
        self,
      });
    });
  });

  describe("createElement", () => {
    it("creates a DOM VNode", () => {
      const vnode = createElement("div", { someProp: "someValue" });
      assert.deepEqual(vnode, {
        $$typeof: elementSymbol,
        type: "div",
        props: { someProp: "someValue" },
        key: null,
      });
    });

    it("sets `children` prop to third arg if there are exactly 3 args", () => {
      const vnode = createElement("div", {}, "child");
      assert.deepEqual(vnode, {
        $$typeof: elementSymbol,
        type: "div",
        props: { children: "child" },
        key: null,
      });
    });

    it("sets `children` prop to array if there are more than 3 args", () => {
      const vnode = createElement("div", {}, "childA", "childB");
      assert.deepEqual(vnode, {
        $$typeof: elementSymbol,
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
        $$typeof: elementSymbol,
        type: "div",
        props: { otherProp: "testValue" },
        key: "aKey",
      });
    });

    it("sets ref", () => {
      const ref = {};
      const vnode = createElement("div", {
        ref,
        otherProp: "testValue",
      });
      assert.deepEqual(vnode, {
        $$typeof: elementSymbol,
        type: "div",
        props: { otherProp: "testValue", ref },
        key: null,
      });
    });

    [null, undefined].forEach((props) => {
      it("allows `props` argument to be `null` or `undefined`", () => {
        const vnode = createElement("div", props);
        assert.deepEqual(vnode, {
          $$typeof: elementSymbol,
          type: "div",
          props: {},
          key: null,
        });
      });
    });

    it("removes `__source` and `__self` props", () => {
      const vnode = createElement("div", {
        __source: "the-source",
        __self: "the-self",
      });
      assert.deepEqual(vnode, {
        $$typeof: elementSymbol,
        type: "div",
        props: {},
        key: null,
      });
    });

    it("sets key to `null` if missing", () => {
      const vnode = createElement("div", { someProp: "someValue" });
      assert.deepEqual(vnode, {
        $$typeof: elementSymbol,
        type: "div",
        props: { someProp: "someValue" },
        key: null,
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
