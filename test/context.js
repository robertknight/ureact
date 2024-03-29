import chai from "chai";
import sinon from "sinon";
const { assert } = chai;

import {
  Fragment,
  createElement as h,
  render,
  createContext,
  useContext,
  useMemo,
} from "../build/index.js";

import { delay } from "./utils/delay.js";
import { createScratchpad } from "./utils/scratchpad.js";

describe("context", () => {
  const scratch = createScratchpad();

  beforeEach(() => {
    scratch.reset();
  });

  after(() => {
    scratch.cleanup();
  });

  const context = createContext("initial-value");
  const Consumer = () => {
    const value = useContext(context) ?? "undefined";
    return h("div", {}, value);
  };

  const ContextTest = (props) => {
    const { value, renderConsumer = true } = props;

    // nb. Use `useMemo` here to avoid the consumer being updated as a result of
    // normal re-rendering. This enforces that the consumer must trigger an
    // update of itself.
    const consumer = useMemo(() => h(Consumer), []);

    if ("value" in props) {
      return h(context.Provider, { value }, renderConsumer && consumer);
    } else {
      return h(Fragment, {}, renderConsumer && consumer);
    }
  };

  it("passes default value down to children", () => {
    const container = scratch.render(h(ContextTest));
    assert.equal(container.innerHTML, "<div>initial-value</div>");
  });

  it("allows `undefined` to override default value", () => {
    const container = scratch.render(h(ContextTest, { value: undefined }));
    assert.equal(container.innerHTML, "<div>undefined</div>");
  });

  it("passes specified value down to children", () => {
    const container = scratch.render(h(ContextTest, { value: "some-value" }));
    assert.equal(container.innerHTML, "<div>some-value</div>");
  });

  it("re-renders subscribed children when context changes", async () => {
    const container = scratch.render(h(ContextTest, { value: "some-value" }));

    scratch.render(h(ContextTest, { value: "updated-value" }));

    // After a re-render, the DOM should display the new value.
    await delay(0);
    assert.equal(container.innerHTML, "<div>updated-value</div>");

    // Test a second update.
    scratch.render(h(ContextTest, { value: "updated-value-2" }));
    await delay(0);
    assert.equal(container.innerHTML, "<div>updated-value-2</div>");
  });

  it("unsubscribes children when unmounted", async () => {
    const container = scratch.render(h(ContextTest, { value: "some-value" }));

    const output = container.querySelector("div");
    assert.equal(output.innerHTML, "some-value");

    render(
      h(ContextTest, { value: "updated-value", renderConsumer: false }),
      container
    );

    await delay(0);
    assert.isNull(output.parentNode); // Context consumer should have been unmounted.
    assert.equal(output.innerHTML, "some-value"); // Consumer should not have been updated.
  });

  it("passes correct context to components when there are multiple providers in the tree", () => {
    const contextA = createContext(null);
    const contextB = createContext(null);

    const Consumer = () => {
      const valueA = useContext(contextA);
      const valueB = useContext(contextB);

      return h("div", {}, valueA, " ", valueB);
    };

    const container = scratch.render(
      h(
        contextA.Provider,
        { value: "a" },
        h(contextB.Provider, { value: "b" }, h(Consumer))
      )
    );

    assert.equal(container.innerHTML, "<div>a b</div>");
  });

  it("allows a provider to override a provider higher up the tree", () => {
    const context = createContext("default");

    const Consumer = () => {
      const value = useContext(context);
      return h("div", {}, value);
    };

    const container = scratch.render(
      h(
        context.Provider,
        { value: "first" },
        h(context.Provider, { value: "second" }, h(Consumer))
      )
    );

    assert.equal(container.innerHTML, "<div>second</div>");
  });

  [false, "some-text", h("div"), null].forEach((initialChild, i) => {
    it(`allows components rendered after an update to read context (${i})`, () => {
      const context = createContext("default");

      const Consumer = () => {
        const value = useContext(context);
        return h("div", {}, value);
      };

      // Render tree initially without the consumer present but some other
      // child or no child.
      let initialVNode;
      if (initialChild !== null) {
        initialVNode = h(context.Provider, { value: "data" }, initialChild);
      } else {
        initialVNode = h(context.Provider, { value: "data" });
      }
      const container = scratch.render(initialVNode);

      // Re-render the tree with the consumer present.
      scratch.render(h(context.Provider, { value: "data" }, h(Consumer)));

      assert.equal(container.innerHTML, "<div>data</div>");
    });
  });
});
