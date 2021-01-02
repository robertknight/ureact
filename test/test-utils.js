import chai from "chai";
import * as sinon from "sinon";
import { JSDOM } from "jsdom";
const { assert } = chai;

import {
  createElement as h,
  render,
  useEffect,
  useLayoutEffect,
  useState,
} from "../build/index.js";

import { act } from "../build/test-utils.js";

describe("test-utils", () => {
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

  describe("act", () => {
    it("flushes pending state updates", () => {
      const Widget = () => {
        const [value, setValue] = useState(0);
        if (value < 10) {
          setValue(value + 1);
        }
        return value;
      };

      const container = testRender(h(Widget));
      assert.equal(container.innerHTML, "0");

      act(() => {});

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

      const container = testRender(h(Widget));
      assert.equal(effectCount, 0);

      act(() => {});

      assert.equal(effectCount, 1);
    });

    it("flushes pending layout effects", () => {
      let effectCount = 0;
      const Widget = () => {
        useLayoutEffect(() => {
          ++effectCount;
        }, []);
        return null;
      };

      const container = testRender(h(Widget));
      assert.equal(effectCount, 0);

      act(() => {});

      assert.equal(effectCount, 1);
    });

    it("supports async callbacks", async () => {
      const Widget = () => {
        const [count, setCount] = useState(0);
        return h("button", { onClick: () => setCount((c) => c + 1) }, count);
      };

      const container = testRender(h(Widget));
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

      const container = testRender(h(Widget));
      const button = container.querySelector("button");

      act(() => {
        act(() => {
          button.click();
        });
        assert.equal(container.innerHTML, "<button>0</button>");
      });
      assert.equal(container.innerHTML, "<button>1</button>");
    });
  });
});
