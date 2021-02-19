import chai from "chai";
import * as sinon from "sinon";
const { assert } = chai;

import {
  createElement as h,
  render,
  useEffect,
  useLayoutEffect,
  useState,
} from "../build/index.js";

import { act } from "../build/test-utils.js";

import { createScratchpad } from "./utils/scratchpad.js";

describe("test-utils", () => {
  const scratch = createScratchpad();

  beforeEach(() => {
    scratch.reset();
  });

  after(() => {
    scratch.cleanup();
  });

  describe("act", () => {
    it("flushes pending state updates", () => {
      const Widget = () => {
        const [value, setValue] = useState(0);
        if (value < 10) {
          setValue(value + 1);
        }
        return value;
      };

      let container;

      act(() => {
        container = scratch.render(h(Widget));
        assert.equal(container.innerHTML, "0");
      });

      assert.equal(container.innerHTML, "10");
    });

    it("flushes pending effects", () => {
      let effectCount = 0;
      const Widget = () => {
        useEffect(() => {
          ++effectCount;
        }, []);
        return null;
      };

      act(() => {
        scratch.render(h(Widget));
        assert.equal(effectCount, 0);
      });

      assert.equal(effectCount, 1);
    });

    it("supports async callbacks", async () => {
      const Widget = () => {
        const [count, setCount] = useState(0);
        return h("button", { onClick: () => setCount((c) => c + 1) }, count);
      };

      const container = scratch.render(h(Widget));
      const button = container.querySelector("button");

      await act(async () => {
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 1));
        button.click();
      });

      assert.equal(container.innerHTML, "<button>2</button>");
    });

    it("only flushes when outermost call to `act` returns", () => {
      const Widget = () => {
        const [count, setCount] = useState(0);
        return h("button", { onClick: () => setCount((c) => c + 1) }, count);
      };

      const container = scratch.render(h(Widget));
      const button = container.querySelector("button");

      act(() => {
        act(() => {
          button.click();
        });
        assert.equal(container.innerHTML, "<button>0</button>");
      });
      assert.equal(container.innerHTML, "<button>1</button>");
    });

    const testActWorks = () => {
      const Widget = () => {
        const [count, setCount] = useState(0);
        return h("button", { onClick: () => setCount((c) => c + 1) }, count);
      };
      const container = scratch.render(h(Widget));
      act(() => {
        container.querySelector("button").click();
      });
      assert.equal(container.innerHTML, "<button>1</button>");
    };

    it("flushes updates if previous `act` callback threw an exception", () => {
      try {
        act(() => {
          throw new Error("Something went wrong");
        });
      } catch {
        // Ignored
      }

      testActWorks();
    });

    it("flushes updates if previous `act` callback rejected", async () => {
      try {
        await act(async () => {
          throw new Error("Something went wrong asynchronously");
        });
      } catch {
        // Ignored
      }

      testActWorks();
    });

    it("flushes updates if there were pending updates before the `act` call", () => {
      const Widget = () => {
        const [count, setCount] = useState(0);
        return h("button", { onClick: () => setCount((c) => c + 1) }, count);
      };

      const container = scratch.render(h(Widget));
      const button = container.querySelector("button");

      // Schedule an update outside of `act`. This is usually a coding mistake
      // in the test, but it shouldn't stop subsequent updates scheduled within
      // an `act` callback from working.
      button.click();

      act(() => {
        button.click();
      });

      assert.equal(container.innerHTML, "<button>2</button>");
    });
  });
});
