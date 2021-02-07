import chai from "chai";
import * as sinon from "sinon";
const { assert } = chai;

import {
  ErrorBoundary,
  createContext,
  createElement as h,
  render,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "../build/index.js";

import { act } from "../build/test-utils.js";

import { createScratchpad } from "./utils/scratchpad.js";

describe("hooks", () => {
  const scratch = createScratchpad();

  beforeEach(() => {
    scratch.reset();
  });

  after(() => {
    scratch.cleanup();
  });

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
      const container = scratch.render(h(Widget));
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

      const container = scratch.render(h(Widget));
      scratch.render(h(Widget));

      assert.equal(container.innerHTML, "<div>Hello</div>");
      assert.equal(lazyInitCount, 1); // Lazy initializer should only be called the first time.
    });

    it("preserves initial state after a re-render", () => {
      const Widget = ({ initialState }) => {
        const [state] = useState(initialState);
        return state;
      };
      const container = scratch.render(h(Widget, { initialState: "Hello" }));
      scratch.render(h(Widget, { initialState: "World" }));
      assert.equal(container.innerHTML, "Hello");
    });

    it("stores correct state per hook", () => {
      const Widget = () => {
        const [valueA] = useState("Hello ");
        const [valueB] = useState("world");
        return h("div", {}, valueA, valueB);
      };
      const container = scratch.render(h(Widget));
      assert.equal(container.innerHTML, "<div>Hello world</div>");
    });

    it("re-renders component asynchronously after a state update", async () => {
      const Counter = () => {
        const [count, setCount] = useState(0);
        const increment = () => setCount(count + 1);
        return h("button", { onClick: increment }, count);
      };

      const container = scratch.render(h(Counter));
      assert.equal(container.innerHTML, "<button>0</button>");

      // Fire an event that triggers a state update. This should trigger a
      // component update, but only after a delay.
      container.querySelector("button").click();
      assert.equal(container.innerHTML, "<button>0</button>");
      await delay(0);
      assert.equal(container.innerHTML, "<button>1</button>");

      // Trigger another event. This should trigger another state update, but
      // only after a delay.
      container.querySelector("button").click();
      assert.equal(container.innerHTML, "<button>1</button>");
      await delay(0);
      assert.equal(container.innerHTML, "<button>2</button>");
    });

    it("re-renders component only once after a state update", async () => {
      const Counter = ({ renderCount }) => {
        ++renderCount.value;
        const [count, setCount] = useState(0);
        const increment = () => setCount(count + 1);
        return h("button", { onClick: increment }, count);
      };

      const countA = { value: 0 };
      const countB = { value: 0 };

      const container = scratch.render(
        h(
          "div",
          {},
          h(Counter, { renderCount: countA }),
          h(Counter, { renderCount: countB })
        )
      );

      // Trigger an update in the first `Counter` component.
      container.querySelectorAll("button")[0].click();
      await delay(0);
      assert.equal(countA.value, 2);
      assert.equal(countB.value, 1);

      // Trigger an update in the second `Counter` component.
      //
      // Only the second component should re-render, verifying that the first
      // component is no longer in the "pending update" set.
      container.querySelectorAll("button")[1].click();
      await delay(0);

      assert.equal(
        container.innerHTML,
        "<div><button>1</button><button>1</button></div>"
      );
      assert.equal(countA.value, 2);
      assert.equal(countB.value, 2);
    });

    it("supports functional state updates", async () => {
      const Counter = () => {
        const [count, setCount] = useState(0);
        const increment = () => setCount((count) => count + 1);
        return h("button", { onClick: increment }, count);
      };

      const container = scratch.render(h(Counter));
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

      const container = scratch.render(h(Counter));
      container.querySelector("button").click();

      scratch.render(h(null));
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

      const container = scratch.render(h(Parent));
      container.querySelector("button").click();

      scratch.render(h(null));
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
      const container = scratch.render(h(Widget));
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
      const container = scratch.render(h(Widget));
      assert.equal(container.innerHTML, "<div>64</div>");
    });

    it("updates state when action is dispatched", async () => {
      const container = scratch.render(h(Counter));
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
      const container = scratch.render(h(Counter));
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
      const container = scratch.render(h(Widget));
      scratch.render(h(Widget));
      scratch.render(h(Widget));
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

        const container = scratch.render(h(Widget));
        assert.equal(effectCount, 0);
        await delay(0);
        assert.equal(effectCount, 1);

        scratch.render(h(Widget));
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

        const container = scratch.render(h(Widget));
        assert.equal(effectCount, 0);
        await delay(0);
        assert.equal(effectCount, 1);

        scratch.render(h(Widget));
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

        const container = scratch.render(h(Widget, { tag: 1 }));
        assert.equal(effectCount, 0);
        await delay(0);
        assert.equal(effectCount, 1);

        // Re-render without changing effect dependencies.
        scratch.render(h(Widget, { tag: 1 }));
        assert.equal(effectCount, 1);
        await delay(0);
        assert.equal(effectCount, 1);

        // Re-render with a change to effect dependencies.
        scratch.render(h(Widget, { tag: 2 }));
        assert.equal(effectCount, 1);
        await delay(0);
        assert.equal(effectCount, 2);

        // Re-render again without changing dependencies.
        scratch.render(h(Widget, { tag: 2 }));
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

        const container = scratch.render(h(Widget));
        await delay(0);
        assert.deepEqual(items, [1]);

        scratch.render(h(null));
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

        const container = scratch.render(h(Widget));
        await delay(0);

        scratch.render(h(Widget));
        await delay(0);

        assert.equal(effectCount, 2);
        assert.deepEqual(items, [2]);
      });
    });

    const BrokenEffect = () => {
      useEffect(() => {
        throw new Error("Effect error");
      });
      return h("div", {}, "Test");
    };

    const BrokenCleanup = () => {
      useEffect(() => {
        return () => {
          throw new Error("Cleanup error");
        };
      });
      return h("div", {}, "Test");
    };

    it("unmounts component tree if an unhandled error is thrown during an effect", () => {
      const container = scratch.render(h("button"));

      assert.throws(() => {
        act(() => {
          scratch.render(h(BrokenEffect));
        });
      }, "Effect error");

      assert.equal(container.innerHTML, "");
    });

    it("allows error boundary to handle errors thrown during effects", () => {
      const App = () => {
        const [error, setError] = useState(null);
        return h(
          ErrorBoundary,
          { handler: setError },
          error ? error.message : h(BrokenEffect)
        );
      };

      const container = scratch.render(h("button"));

      act(() => {
        scratch.render(h(App));
      });

      assert.equal(container.innerHTML, "Effect error");
    });

    it("unmounts component tree if an unhandled error is thrown during effect cleanup", () => {
      let container;
      act(() => {
        container = scratch.render(h(BrokenCleanup));
      });

      assert.throws(() => {
        // Re-render. This will run cleanup from the previous render.
        act(() => {
          scratch.render(h(BrokenCleanup));
        });
      }, "Cleanup error");

      assert.equal(container.innerHTML, "");
    });

    it("allows error boundary to handle errors thrown during effect cleanup", () => {
      const App = () => {
        const [error, setError] = useState(null);
        return h(
          ErrorBoundary,
          { handler: setError },
          error ? error.message : h(BrokenCleanup)
        );
      };

      let container;
      act(() => {
        container = scratch.render(h(App));
      });

      act(() => {
        scratch.render(h(App));
      });

      assert.equal(container.innerHTML, "Cleanup error");
    });
  });

  it("flushes layout effects if effect flush is pending", () => {
    let resolveEffectCalled;
    let effectCalled = new Promise(
      (resolve) => (resolveEffectCalled = resolve)
    );
    let resolveLayoutEffectCalled;
    let layoutEffectCalled = new Promise(
      (resolve) => (resolveLayoutEffectCalled = resolve)
    );

    const Widget = () => {
      // nb. Hook order is important to reproduce the original issue.
      useEffect(resolveEffectCalled);
      useLayoutEffect(resolveLayoutEffectCalled);
    };
    scratch.render(h(Widget));

    return Promise.all([effectCalled, layoutEffectCalled]);
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

      const container = scratch.render(h(Widget, { value: 2 }));
      assert.equal(container.innerHTML, "<div>4</div>");

      scratch.render(h(Widget, { value: 2 }));
      assert.equal(calcCount, 1);
      assert.equal(container.innerHTML, "<div>4</div>");

      scratch.render(h(Widget, { value: 4 }));
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

      const container = scratch.render(h(Widget, { power: 2 }));
      const initialCallback = callback;
      assert.equal(callback(4), 16);

      scratch.render(h(Widget, { power: 2 }));
      assert.equal(callback, initialCallback);

      scratch.render(h(Widget, { power: 3 }));
      assert.notEqual(callback, initialCallback);
      assert.equal(callback(4), 64);
    });
  });

  describe("hook ordering", () => {
    it("throws an error if hooks are called in different order across renders", () => {
      const Widget = ({ effectFirst }) => {
        if (effectFirst) {
          useEffect(() => {});
        } else {
          useState(0);
        }
      };

      scratch.render(h(Widget, { effectFirst: true }));
      assert.throws(() => {
        scratch.render(h(Widget, { effectFirst: false }));
      }, "Hook type mismatch. Hooks must be called in same order on each render.");
    });

    it("does not throw an error if all hook types are used in same order", () => {
      const Widget = () => {
        useEffect(() => {});
        useState(0);
        useLayoutEffect(() => {});
        useContext(ContextType);
        useMemo(() => 0, []);
        useRef(null);
        useCallback(() => {}, []);
      };

      const ContextType = createContext(null);

      const App = () => {
        return h(ContextType.Provider, { value: 42 }, h(Widget));
      };

      scratch.render(h(App));
      scratch.render(h(App));
    });
  });
});
