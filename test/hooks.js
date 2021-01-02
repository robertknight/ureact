import chai from "chai";
import * as sinon from "sinon";
import { JSDOM } from "jsdom";
const { assert } = chai;

import {
  createElement as h,
  render,
  useCallback,
  // `useContext` is not here because it is tested separately.
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "../build/index.js";

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

  describe("useReducer", () => {
    let renderCount = 0;

    const Counter = () => {
      ++renderCount;

      const [state, dispatch] = useReducer((state, action) => {
        if (action === "increment") {
          return state + 1;
        } else if (action === "decrement") {
          return state - 1;
        } else {
          return state;
        }
      }, 0);

      const increment = () => dispatch("increment");
      const decrement = () => dispatch("decrement");
      const doNothing = () => dispatch("ignore-me");

      return h(
        "div",
        {},
        h("button", { testid: "up", onClick: increment }, "Up"),
        h("button", { testid: "down", onClick: decrement }, "Down"),
        h("button", { testid: "noop", onClick: doNothing }, "Ignore me"),
        h("p", {}, state)
      );
    };

    beforeEach(() => {
      renderCount = 0;
    });

    it("sets initial state from 2nd arg", () => {
      const Widget = () => {
        const initialState = "Test";
        const [state, dispatch] = useReducer((state) => state, initialState);
        return h("div", {}, state);
      };
      const container = testRender(h(Widget));
      assert.equal(container.innerHTML, "<div>Test</div>");
    });

    it("sets initial state from 2nd and 3rd args if present", () => {
      const Widget = () => {
        const initialState = 4;
        const [state, dispatch] = useReducer(
          (state) => state,
          initialState,
          (arg) => arg ** 3
        );
        return h("div", {}, state);
      };
      const container = testRender(h(Widget));
      assert.equal(container.innerHTML, "<div>64</div>");
    });

    it("updates state when action is dispatched", async () => {
      const container = testRender(h(Counter));
      const outputEl = container.querySelector("p");
      const upButton = container.querySelector("button[testid=up]");
      const downButton = container.querySelector("button[testid=down]");

      assert.equal(outputEl.textContent, "0");

      // Perform several tests involving clicking on a button, waiting for
      // a re-render and then checking the content.
      upButton.click();
      await delay(0);
      assert.equal(outputEl.textContent, "1");

      upButton.click();
      await delay(0);
      assert.equal(outputEl.textContent, "2");

      downButton.click();
      await delay(0);
      assert.equal(outputEl.textContent, "1");

      // Test what happens if multiple actions are triggered before a re-render
      // happens.
      downButton.click();
      downButton.click();
      await delay(0);
      assert.equal(outputEl.textContent, "-1");
    });

    it("does not re-render if state did not change", async () => {
      const container = testRender(h(Counter));
      const noopButton = container.querySelector("button[testid=noop]");

      assert.equal(renderCount, 1);
      noopButton.click();
      await delay(0);

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

  // Shared tests for effects. The only difference between `useEffect` and
  // `useLayoutEffect` is when it runs.
  [useEffect, useLayoutEffect].forEach((useEffect) => {
    describe(useEffect.name, () => {
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

  describe("useMemo", () => {
    it("recomputes value when dependencies change", () => {
      let calcCount = 0;
      const Widget = ({ value }) => {
        const squared = useMemo(() => {
          ++calcCount;
          return value * value;
        }, [value]);
        return h("div", {}, squared);
      };

      const container = testRender(h(Widget, { value: 2 }));
      assert.equal(container.innerHTML, "<div>4</div>");

      render(h(Widget, { value: 2 }), container);
      assert.equal(calcCount, 1);
      assert.equal(container.innerHTML, "<div>4</div>");

      render(h(Widget, { value: 4 }), container);
      assert.equal(calcCount, 2);
      assert.equal(container.innerHTML, "<div>16</div>");
    });
  });

  describe("useCallback", () => {
    let callback;

    it("recreates callback when dependencies change", () => {
      const Widget = ({ power }) => {
        callback = useCallback((value) => value ** power, [power]);
        return "Hello";
      };

      const container = testRender(h(Widget, { power: 2 }));
      const initialCallback = callback;
      assert.equal(callback(4), 16);

      render(h(Widget, { power: 2 }), container);
      assert.equal(callback, initialCallback);

      render(h(Widget, { power: 3 }), container);
      assert.notEqual(callback, initialCallback);
      assert.equal(callback(4), 64);
    });
  });
});
