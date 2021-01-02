const { assert } = require("chai");
const sinon = require("sinon");
const { JSDOM } = require("jsdom");

const { Fragment, createElement: h, render } = require("../build/index");

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
});
