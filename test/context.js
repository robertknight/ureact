const { assert } = require("chai");
const sinon = require("sinon");
const { JSDOM } = require("jsdom");

const {
  createElement: h,
  render,
  createContext,
  useContext,
  useMemo,
} = require("../build/index");

const { delay } = require("./utils/delay");

describe("context", () => {
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
    const providerProps = {};
    if ("value" in props) {
      providerProps.value = value;
    }
    return h(context.Provider, providerProps, renderConsumer && consumer);
  };

  it("passes default value down to children", () => {
    const container = testRender(h(ContextTest));
    assert.equal(container.innerHTML, "<div>initial-value</div>");
  });

  it("allows `undefined` to override default value", () => {
    const container = testRender(h(ContextTest, { value: undefined }));
    assert.equal(container.innerHTML, "<div>undefined</div>");
  });

  it("passes specified value down to children", () => {
    const container = testRender(h(ContextTest, { value: "some-value" }));
    assert.equal(container.innerHTML, "<div>some-value</div>");
  });

  it("re-renders subscribed children when context changes", async () => {
    const container = testRender(h(ContextTest, { value: "some-value" }));

    render(h(ContextTest, { value: "updated-value" }), container);

    // After a re-render, the DOM should display the new value.
    await delay(0);
    assert.equal(container.innerHTML, "<div>updated-value</div>");

    // Test a second update.
    render(h(ContextTest, { value: "updated-value-2" }), container);
    await delay(0);
    assert.equal(container.innerHTML, "<div>updated-value-2</div>");
  });

  it("unsubscribes children when unmounted", async () => {
    const container = testRender(h(ContextTest, { value: "some-value" }));

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
    const contextA = createContext("a");
    const contextB = createContext("b");

    const Consumer = () => {
      const valueA = useContext(contextA);
      const valueB = useContext(contextB);

      return h("div", {}, valueA, " ", valueB);
    };

    const container = testRender(
      h(contextA.Provider, {}, h(contextB.Provider, {}, h(Consumer)))
    );

    assert.equal(container.innerHTML, "<div>a b</div>");
  });

  it("allows a provider to override a provider higher up the tree", () => {
    const context = createContext("default");

    const Consumer = () => {
      const value = useContext(context);
      return h("div", {}, value);
    };

    const container = testRender(
      h(
        context.Provider,
        { value: "first" },
        h(context.Provider, { value: "second" }, h(Consumer))
      )
    );

    assert.equal(container.innerHTML, "<div>second</div>");
  });
});
