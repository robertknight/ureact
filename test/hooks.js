const { assert } = require("chai");
const sinon = require("sinon");
const { JSDOM } = require("jsdom");

const { useState, createElement: h, render } = require("../build/index");

describe("hooks", () => {
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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  describe("useState", () => {
    it("throws if called outside render", () => {
      assert.throws(() => {
        useState(null);
      }, "Hook called outside of component");
    });

    it("sets initial state to `useState` arg", () => {
      const Widget = () => {
        const [value] = useState("Hello");
        return h("div", {}, value);
      };
      const container = testRender(h(Widget));
      assert.equal(container.innerHTML, "<div>Hello</div>");
    });

    it("supports lazy state initializer", () => {
      let lazyInitCount = 0;
      const Widget = () => {
        const [value] = useState(() => {
          ++lazyInitCount;
          return "Hello";
        });
        return h("div", {}, value);
      };

      const container = testRender(h(Widget));
      render(h(Widget), container);

      assert.equal(container.innerHTML, "<div>Hello</div>");
      assert.equal(lazyInitCount, 1); // Lazy initializer should only be called the first time.
    });

    it("preserves initial state after a re-render", () => {
      const Widget = ({ initialState }) => {
        const [state] = useState(initialState);
        return state;
      };
      const container = testRender(h(Widget, { initialState: "Hello" }));
      render(h(Widget, { initialState: "World" }), container);
      assert.equal(container.innerHTML, "Hello");
    });

    it("stores correct state per hook", () => {
      const Widget = () => {
        const [valueA] = useState("Hello ");
        const [valueB] = useState("world");
        return h("div", {}, valueA, valueB);
      };
      const container = testRender(h(Widget));
      assert.equal(container.innerHTML, "<div>Hello world</div>");
    });

    it("re-renders component asynchronously after a state update", async () => {
      const Counter = () => {
        const [count, setCount] = useState(0);
        const increment = () => setCount(count + 1);
        return h("button", { onClick: increment }, count);
      };

      const container = testRender(h(Counter));
      assert.equal(container.innerHTML, "<button>0</button>");

      container.querySelector("button").click();
      assert.equal(container.innerHTML, "<button>0</button>");
      await delay(0);
      assert.equal(container.innerHTML, "<button>1</button>");

      container.querySelector("button").click();
      assert.equal(container.innerHTML, "<button>1</button>");
      await delay(0);
      assert.equal(container.innerHTML, "<button>2</button>");
    });

    it("supports functional state updates", async () => {
      const Counter = () => {
        const [count, setCount] = useState(0);
        const increment = () => setCount((count) => count + 1);
        return h("button", { onClick: increment }, count);
      };

      const container = testRender(h(Counter));
      assert.equal(container.innerHTML, "<button>0</button>");

      container.querySelector("button").click();
      container.querySelector("button").click();

      await delay(0);
      assert.equal(container.innerHTML, "<button>2</button>");
    });
  });
});
