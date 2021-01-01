const { assert } = require("chai");
const sinon = require("sinon");
const { JSDOM } = require("jsdom");

const {
  createElement: h,
  render,
  useEffect,
  useRef,
  useState,
} = require("../build/index");

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

    it("cancels pending re-renders if component is unmounted", async () => {
      let renderCount = 0;

      const Counter = () => {
        ++renderCount;

        const [count, setCount] = useState(0);
        const increment = () => setCount((count) => count + 1);
        return h("button", { onClick: increment }, count);
      };

      const container = testRender(h(Counter));
      container.querySelector("button").click();

      render(h(null), container);
      await delay(0);

      assert.equal(container.innerHTML, "");
      assert.equal(renderCount, 1);
    });

    it("cancels pending re-renders if parent is unmounted", async () => {
      let renderCount = 0;

      const Counter = () => {
        ++renderCount;

        const [count, setCount] = useState(0);
        const increment = () => setCount((count) => count + 1);
        return h("button", { onClick: increment }, count);
      };
      const Parent = () => h(Counter);

      const container = testRender(h(Parent));
      container.querySelector("button").click();

      render(h(null), container);
      await delay(0);

      assert.equal(container.innerHTML, "");
      assert.equal(renderCount, 1);
    });
  });

  describe("useRef", () => {
    it("returns a value that persists between renders", () => {
      let counter = 0;
      const Widget = () => {
        const value = useRef(++counter);
        return h("div", {}, value.current);
      };
      const container = testRender(h(Widget));
      render(h(Widget), container);
      render(h(Widget), container);
      assert.equal(container.innerHTML, "<div>1</div>");
    });
  });

  describe("useEffect", () => {
    let effectCount = 0;

    beforeEach(() => {
      effectCount = 0;
    });

    it("schedules a callback that runs after rendering", async () => {
      const Widget = () => {
        useEffect(() => {
          ++effectCount;
        });
        return "Hello world";
      };

      const container = testRender(h(Widget));
      assert.equal(effectCount, 0);
      await delay(0);
      assert.equal(effectCount, 1);

      render(h(Widget), container);
      assert.equal(effectCount, 1);
      await delay(0);
      assert.equal(effectCount, 2);
    });

    it("never re-runs effects with no dependencies", async () => {
      const Widget = () => {
        useEffect(() => {
          ++effectCount;
        }, []);
        return "Hello world";
      };

      const container = testRender(h(Widget));
      assert.equal(effectCount, 0);
      await delay(0);
      assert.equal(effectCount, 1);

      render(h(Widget), container);
      assert.equal(effectCount, 1);
      await delay(0);
      assert.equal(effectCount, 1);
    });

    it("only re-runs effects when dependencies change", async () => {
      const Widget = ({ tag }) => {
        useEffect(() => {
          ++effectCount;
        }, [tag]);
        return "Hello world";
      };

      const container = testRender(h(Widget, { tag: 1 }));
      assert.equal(effectCount, 0);
      await delay(0);
      assert.equal(effectCount, 1);

      // Re-render without changing effect dependencies.
      render(h(Widget, { tag: 1 }), container);
      assert.equal(effectCount, 1);
      await delay(0);
      assert.equal(effectCount, 1);

      // Re-render with a change to effect dependencies.
      render(h(Widget, { tag: 2 }), container);
      assert.equal(effectCount, 1);
      await delay(0);
      assert.equal(effectCount, 2);
    });

    it("runs cleanup when component is unmounted", async () => {
      const items = [];
      const Widget = () => {
        useEffect(() => {
          ++effectCount;
          items.push(effectCount);
          return () => {
            items.length = 0;
          };
        });
        return "Hello world";
      };

      const container = testRender(h(Widget));
      await delay(0);
      assert.deepEqual(items, [1]);

      render(h(null), container);
      assert.deepEqual(items, []);
    });

    it("runs cleanup when effect is run a second time", async () => {
      let items = [];
      const Widget = () => {
        useEffect(() => {
          ++effectCount;
          items.push(effectCount);
          return () => {
            items = items.filter((it) => it !== effectCount);
          };
        });
        return "Hello world";
      };

      const container = testRender(h(Widget));
      await delay(0);

      render(h(Widget), container);
      await delay(0);

      assert.equal(effectCount, 2);
      assert.deepEqual(items, [2]);
    });
  });
});
