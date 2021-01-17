import chai from "chai";
import { JSDOM } from "jsdom";
import sinon from "sinon";
const { assert } = chai;

import { ReactWrapper, mount } from "../build/enzyme.js";
import {
  Fragment,
  createElement as h,
  useEffect,
  useState,
} from "../build/index.js";

describe("Enzyme testing API", () => {
  let jsdom;

  before(() => {
    jsdom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    globalThis.document = jsdom.window.document;
    globalThis.Event = jsdom.window.Event;
  });

  after(() => {
    jsdom.window.close();
    globalThis.document = null;
    globalThis.Event = null;
  });

  describe("mount", () => {
    it("renders VNode and returns wrapper around output", () => {
      const wrapper = mount(h("div"));
      assert.instanceOf(wrapper, ReactWrapper);
      assert.equal(wrapper.length, 1);
      assert.equal(wrapper.debug(), "<div/>");
    });

    it("flushes state updates and effects", () => {
      let effectCalled = false;

      const Widget = () => {
        useEffect(() => {
          effectCalled = true;
        }, []);
        return null;
      };
      const wrapper = mount(h(Widget));

      assert.equal(effectCalled, 1);
    });

    it("renders into element specified by `attachTo` option", () => {
      const container = document.createElement("div");
      const wrapper = mount(h("button", {}, "Test"), { attachTo: container });
      assert.equal(container.innerHTML, "<button>Test</button>");
    });
  });

  describe("simple selector matching", () => {
    it("matches a DOM element", () => {
      const wrapper = mount(h("div"));
      assert.isTrue(wrapper.exists("div"));
      assert.isFalse(wrapper.exists("li"));
    });

    it("matches custom DOM elements", () => {
      const wrapper = mount(h("foo-bar"));
      assert.isTrue(wrapper.exists("foo-bar"));
    });

    it("matches a custom component", () => {
      const Widget = () => null;
      const wrapper = mount(h(Widget));
      assert.isTrue(wrapper.exists("Widget"));
      assert.isFalse(wrapper.exists("OtherWidget"));
      assert.isFalse(wrapper.exists("widget")); // Case-sensitive
    });

    it("matches a custom component with a display name", () => {
      const Widget = () => null;
      Widget.displayName = "HelloWidget";

      const wrapper = mount(h(Widget));

      assert.isTrue(wrapper.exists("HelloWidget"));
      assert.isFalse(wrapper.exists("Widget"));
    });

    it("matches a class name", () => {
      const wrapper = mount(h("div", { className: "foo bar" }));
      assert.isTrue(wrapper.exists(".foo"));
      assert.isTrue(wrapper.exists(".bar"));
      assert.isFalse(wrapper.exists(".baz"));
      assert.isTrue(wrapper.exists(".foo.bar"));
    });

    it("matches an ID", () => {
      const wrapper = mount(h("div", { id: "myDiv" }));
      assert.isTrue(wrapper.exists("#myDiv"));
      assert.isFalse(wrapper.exists("#theirDiv"));
    });

    it("matches a prop value", () => {
      const wrapper = mount(h("div", { className: "foobar" }));
      assert.isTrue(wrapper.exists("[className=foobar]"));
      assert.isFalse(wrapper.exists("[className=foo]"));
    });

    it("matches a boolean prop value", () => {
      const wrapper = mount(h("button", { disabled: true }));
      assert.isTrue(wrapper.exists("[disabled=true]"));
      assert.isFalse(wrapper.exists("[disabled=false]"));
    });

    it("matches a number prop value", () => {
      const wrapper = mount(h("button", { tabIndex: 10 }));
      assert.isTrue(wrapper.exists("[tabIndex=10]"));
      assert.isFalse(wrapper.exists("[tabIndex=1]"));
    });

    it("matches a null prop value", () => {
      const Widget = () => null;
      const wrapper = mount(h(Widget, { aProp: null }));
      assert.isTrue(wrapper.exists("[aProp=null]"));
      assert.isFalse(wrapper.exists("[aProp=false]"));
    });

    it("matches a quoted prop value", () => {
      const wrapper = mount(h("div", { foo: "foo bar" }));
      assert.isTrue(wrapper.exists('[foo="foo bar"]'));
      assert.isFalse(wrapper.exists('[foo="foo baz"]'));
    });

    it("matches multiple prop values", () => {
      const wrapper = mount(h("div", { foo: "one", bar: "two" }));
      assert.isTrue(wrapper.exists("[foo=one,bar=two]"));
      assert.isFalse(wrapper.exists("[foo=one,bar=one]"));
      assert.isFalse(wrapper.exists("[foo=two,bar=two]"));
    });
  });

  describe("combinator selector matching", () => {
    it("matches a descendant selector", () => {
      const wrapper = mount(
        h("article", {}, h("h1", {}, "Heading"), h("p", {}, "Some text"))
      );
      assert.equal(wrapper.find("article h1").text(), "Heading");
      assert.equal(wrapper.find("article p").text(), "Some text");
    });

    it("matches descendants for a descendant selector", () => {
      const wrapper = mount(
        h(
          "article",
          {},
          h("div", { className: "foo" }, h("div", { className: "bar" }))
        )
      );
      const matches = wrapper.find("article div");
      assert.equal(matches.length, 2);
      assert.deepEqual(matches.at(0).prop("className"), "foo");
      assert.deepEqual(matches.at(1).prop("className"), "bar");
    });

    it("matches a direct descendant selector", () => {
      const wrapper = mount(
        h(
          "article",
          {},
          h(
            "div",
            { className: "foo" },
            h("div", { className: "bar" }, h("div", { className: "baz" }))
          )
        )
      );

      // Single `>` combinator.
      let matches = wrapper.find("article > div");
      assert.equal(matches.length, 1);
      assert.deepEqual(matches.prop("className"), "foo");

      // Multiple `>` combinators.
      matches = wrapper.find("article > div > div");
      assert.equal(matches.length, 1);
      assert.deepEqual(matches.prop("className"), "bar");
    });
  });

  describe("component type selector matching", () => {
    it("matches a custom component (as a function)", () => {
      const Widget = () => null;
      const wrapper = mount(h(Widget));
      assert.isTrue(wrapper.exists(Widget));
    });
  });

  describe("prop selector matching", () => {
    it("matches a prop object", () => {
      const Widget = () => null;
      const wrapper = mount(h(Widget, { foo: "a", bar: "b" }));

      // Partial props.
      assert.isTrue(
        wrapper.exists({
          foo: "a",
        })
      );

      // Multiple props.
      assert.isTrue(
        wrapper.exists({
          foo: "a",
          bar: "b",
        })
      );

      // Mismatch
      assert.isFalse(
        wrapper.exists({
          foo: "b",
        })
      );
    });
  });

  describe("invalid selector handling", () => {
    ["^", "x + y", "", "{ div }", null, true, 42].forEach((selector) => {
      it(`throws an error for invalid selector "${selector}"`, () => {
        const wrapper = mount(h("div"));
        assert.throws(() => {
          wrapper.exists(selector);
        }, /Invalid|Expected/);
      });
    });

    it("includes selector text in error if string selector cannot be parsed", () => {
      const wrapper = mount(h("div"));
      assert.throws(() => {
        wrapper.exists("foo & bar");
      }, 'Invalid or unsupported selector "foo & bar"');
    });
  });

  describe("Wrapper", () => {
    describe("#at", () => {
      it("returns a wrapper around the n-th node", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        ).find("li");

        assert.equal(wrapper.at(0).text(), "One");
        assert.equal(wrapper.at(1).text(), "Two");
        assert.equal(wrapper.at(2).text(), "Three");
      });

      it("throws if index is valid", () => {
        const wrapper = mount(h("div"));
        assert.throws(() => {
          wrapper.at(-1);
        }, "Index is invalid");

        wrapper.at(0);

        assert.throws(() => {
          wrapper.at(1);
        }, "Index is invalid");
      });
    });

    describe("#children", () => {
      it("returns a wrapper around the children of current nodes in the wrapper", () => {
        const wrapper = mount(
          h(Fragment, {}, h("p", {}, "First child"), h("p", {}, "Second child"))
        );

        const children = wrapper.children();
        assert.equal(children.length, 2);
        assert.equal(
          children.debug(),
          "<p>First child</p>\n<p>Second child</p>"
        );
      });
    });

    describe("#contains", () => {
      const createWrapper = () =>
        mount(
          h(
            Fragment,
            {},
            h("div", { className: "foo" }, h("b", {}, "Text")),
            h("div", { className: "bar" }, "Other text")
          )
        );

      it("returns true if wrapper contains matching elements", () => {
        const wrapper = createWrapper();
        assert.isTrue(
          wrapper.contains(h("div", { className: "foo" }, h("b", {}, "Text")))
        );
      });

      it("returns false if attributes do not match", () => {
        const wrapper = createWrapper();
        assert.isFalse(
          wrapper.contains(h("div", { className: "other" }, h("b", {}, "Text")))
        );
      });

      it("returns false if there are extra attributes", () => {
        const wrapper = createWrapper();
        assert.isFalse(
          wrapper.contains(
            h(
              "div",
              { className: "foo", extra: "something" },
              h("b", {}, "Text")
            )
          )
        );
      });

      it("returns false if children do not match", () => {
        const wrapper = createWrapper();

        // Different type of child.
        assert.isFalse(
          wrapper.contains(h("div", { className: "foo" }, h("i", {}, "Text")))
        );

        // Different number of children.
        assert.isFalse(wrapper.contains(h("div", { className: "foo" })));
        assert.isFalse(
          wrapper.contains(
            h("div", { className: "foo" }, h("b", {}, "Text"), h("b"))
          )
        );
      });
    });

    describe("#debug", () => {
      it("returns debug string for DOM nodes", () => {
        const wrapper = mount(h("div"));
        assert.equal(wrapper.debug(), "<div/>");
      });

      it("returns debug string for component nodes", () => {
        const wrapper = mount(h(Fragment));
        assert.equal(wrapper.debug(), "<Fragment/>");
      });
    });

    describe("#exists", () => {
      it("returns false if wrapper is empty", () => {
        const wrapper = mount(h("div"));
        assert.isFalse(wrapper.find("p").exists());
        assert.isFalse(wrapper.exists("p"));
      });

      it("returns true if wrapper is non-empty", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        );
        assert.isTrue(wrapper.find("ul").exists());
        assert.isTrue(wrapper.find("li").exists());
        assert.isTrue(wrapper.exists("li"));
      });
    });

    describe("#filter", () => {
      it("returns top-level nodes that match selector", () => {
        const wrapper = mount(
          h(
            Fragment,
            {},
            h("div", { className: "foo" }, h("div", { className: "bar" })),
            h("article")
          )
        );

        const divs = wrapper.children().filter("div");

        assert.equal(divs.length, 1);
        assert.equal(divs.prop("className"), "foo");
      });
    });

    describe("#filterWhere", () => {
      it("returns top-level nodes that match predicate", () => {
        const wrapper = mount(
          h(
            Fragment,
            {},
            h("div", { className: "foo" }, h("div", { className: "bar" })),
            h("article")
          )
        );

        const divs = wrapper
          .children()
          .filterWhere((el) => el.type() === "div");

        assert.equal(divs.length, 1);
        assert.equal(divs.prop("className"), "foo");
      });
    });

    describe("#find", () => {
      it("returns wrapper around nodes matching selectors", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        );
        assert.equal(wrapper.find("li").length, 3);
      });

      it("only returns unique nodes", () => {
        const wrapper = mount(
          h("ul", {}, h("li", {}, h("ul", {}, h("li", {}, "Item"))))
        );

        // Find the two `<ul>` elements, where one is a descendant of the other.
        const lists = wrapper.find("ul");

        // Find all the `<li>` items. Each `<li>` should only be found once,
        // even though the most deeply nested `<li>` is a descendant of both the
        // `<ul>` in `lists`.
        const items = lists.find("li");
        assert.equal(items.length, 2);
      });
    });

    describe("#findWhere", () => {
      it("returns wrapper around nodes matching predicate", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        );
        const items = wrapper.findWhere((w) => w.text().startsWith("T"));
        assert.equal(items.length, 2);
        assert.equal(items.debug(), "<li>Two</li>\n<li>Three</li>");
      });
    });

    describe("#first", () => {
      it("returns first item in list", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        ).find("li");

        assert.equal(wrapper.first().text(), "One");
      });
    });

    describe("#forEach", () => {
      it("visits each node in the wrapper", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        );

        const items = [];
        const indexes = [];

        wrapper.find("li").forEach((item, index) => {
          items.push(item.text());
          indexes.push(index);
        });

        assert.deepEqual(items, ["One", "Two", "Three"]);
        assert.deepEqual(indexes, [0, 1, 2]);
      });

      it("only visits top-level nodes in wrapper", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        );

        const items = [];
        // This should only visit the `<ul>`, not the individual `<li>` children.
        wrapper.forEach((item) => items.push(item.text()));
        assert.deepEqual(items, ["OneTwoThree"]);
      });
    });

    describe("#getDOMNode", () => {
      it("returns DOM node from DOM component", () => {
        const wrapper = mount(h("div", { className: "foo" }));
        const node = wrapper.getDOMNode();
        assert.ok(node);
        assert.equal(node.className, "foo");
      });

      it("returns outer DOM node from non-DOM component", () => {
        const Widget = () => h("div", { className: "bar" });
        const wrapper = mount(h(Widget));

        const node = wrapper.getDOMNode();

        assert.ok(node);
        assert.equal(node.className, "bar");
      });

      it("throws if wrapper does not contain a DOM component", () => {
        const wrapper = mount(h(Fragment));
        assert.throws(() => {
          wrapper.getDOMNode();
        }, "Component is not a DOM node");
      });
    });

    describe("#hasClass", () => {
      it("returns true if node has class", () => {
        const wrapper = mount(h("div", { className: "foo" }));
        assert.isTrue(wrapper.hasClass("foo"));
      });

      it("returns false if node does not have class", () => {
        const wrapper = mount(h("div", { className: "foo" }));
        assert.isFalse(wrapper.hasClass("bar"));
      });
    });

    describe("#html", () => {
      it("returns concatenated HTML of all nodes", () => {
        const wrapper = mount(
          h("div", {}, "One", h("span", {}, "Two"), "Three")
        );
        assert.equal(wrapper.html(), "<div>One<span>Two</span>Three</div>");
      });
    });

    describe("#instance", () => {
      it("returns DOM node", () => {
        const wrapper = mount(h("div"));
        assert.equal(wrapper.instance(), wrapper.getDOMNode());
      });
    });

    describe("#key", () => {
      it("returns the component's key", () => {
        const wrapper = mount(h("li", { key: "abc" }));
        assert.equal(wrapper.key(), "abc");
      });
    });

    describe("#last", () => {
      it("returns last item in list", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        ).find("li");

        assert.equal(wrapper.last().text(), "Three");
      });
    });

    describe("#length", () => {
      it("returns the number of nodes in the wrapper", () => {
        let wrapper = mount(h("div"));
        assert.equal(wrapper.length, 1);
        assert.equal(wrapper.find("div").length, 1);
        assert.equal(wrapper.find("span").length, 0);
      });
    });

    describe("#map", () => {
      it("maps each node in the wrapper", () => {
        const wrapper = mount(
          h(
            "ul",
            {},
            h("li", {}, "One"),
            h("li", {}, "Two"),
            h("li", {}, "Three")
          )
        );

        const pairs = wrapper.find("li").map((item, index) => {
          return [index, item.text()];
        });

        assert.deepEqual(pairs, [
          [0, "One"],
          [1, "Two"],
          [2, "Three"],
        ]);
      });
    });

    describe("#prop", () => {
      it("returns the value of the given prop", () => {
        const someProp = {};
        const Widget = (props) => null;

        const wrapper = mount(h(Widget, { someProp }));
        assert.equal(wrapper.prop("someProp"), someProp);
      });

      it("returns `undefined` if there is no such prop", () => {
        const wrapper = mount(h("div"));
        assert.strictEqual(wrapper.prop("className"), undefined);
      });
    });

    describe("#props", () => {
      it("returns the node's props", () => {
        const Widget = () => "Test";
        const vnode = h(Widget, { foo: 1, bar: 2 });
        const wrapper = mount(vnode);
        assert.equal(wrapper.props(), vnode.props);
      });

      it("throws if the wrapper has no nodes", () => {
        const wrapper = mount(h("div")).find("li");
        assert.throws(() => {
          wrapper.props();
        }, `props() called on a wrapper with 0 nodes. Must have one node.`);
      });

      it("throws if the wrapper has multiple nodes", () => {
        const wrapper = mount(h(Fragment, {}, h("div"), h("div"))).find("div");
        assert.throws(() => {
          wrapper.props();
        }, `props() called on a wrapper with 2 nodes. Must have one node.`);
      });
    });

    describe("#setProps", () => {
      it("re-renders node with given props", () => {
        const wrapper = mount(h("a", { href: "https://example.com" }));
        const node = wrapper.getDOMNode();

        wrapper.setProps({ href: "https://foobar.org", className: "test" });

        assert.deepEqual(wrapper.props(), {
          href: "https://foobar.org",
          className: "test",
        });
        assert.equal(node.href, "https://foobar.org/");
        assert.equal(node.className, "test");
      });

      it("flushes state updates and effects", () => {
        const effectArgs = [];

        const Widget = ({ value }) => {
          useEffect(() => {
            effectArgs.push(value);
          }, [value]);
          return null;
        };

        const wrapper = mount(h(Widget, { value: 1 }));
        wrapper.setProps({ value: 2 });

        assert.deepEqual(effectArgs, [1, 2]);
      });
    });

    describe("#simulate", () => {
      it("dispatches event at node", () => {
        const onClick = sinon.stub();
        const wrapper = mount(h("button", { onClick }));

        wrapper.simulate("click");

        sinon.assert.calledOnce(onClick);
      });

      it("sets event args", () => {
        const onInput = sinon.stub();
        const wrapper = mount(h("input", { onInput }));

        wrapper.simulate("input", {
          // Args passed to event constructor.
          bubbles: true,
          cancelable: true,
          composed: true,

          // Other arguments.
          key: "a",
        });

        sinon.assert.calledOnce(onInput);
        const event = onInput.getCall(0).args[0];
        assert.equal(event.bubbles, true);
        assert.equal(event.cancelable, true);
        assert.equal(event.composed, true);
        assert.equal(event.key, "a");
      });

      const Widget = () => {
        const [clicked, setClicked] = useState(false);
        const onClick = () => setClicked(true);
        return h(
          "div",
          {},
          h("button", { onClick }, "Increment"),
          h("span", {}, `Clicked: ${clicked}`)
        );
      };

      it("applies state updates and refreshes tree", () => {
        const wrapper = mount(h(Widget));
        wrapper.find("button").simulate("click");
        assert.equal(wrapper.find("span").text(), "Clicked: true");
      });

      it("only flushes state updates in current root", () => {
        const wrapperA = mount(h(Widget));
        const wrapperB = mount(h(Widget));

        // Trigger an update in a wrapper, but don't flush state updates.
        wrapperA.find("button").getDOMNode().dispatchEvent(new Event("click"));

        // Trigger an update in a different wrapper. This should flush state updates
        // and refresh the wrapper.
        wrapperB.find("button").simulate("click");

        // Update the original wrapper. This should still have the old text because
        // state updates haven't been flushed.
        wrapperA.update();

        // Check that state updates were only flushed in the component tree
        // where `simulate` was called.
        assert.equal(wrapperA.find("span").text(), "Clicked: false");
        assert.equal(wrapperB.find("span").text(), "Clicked: true");
      });
    });

    describe("#text", () => {
      it("returns concatenated text of all nodes", () => {
        const wrapper = mount(
          h("div", {}, "One", h("span", {}, "Two"), "Three")
        );
        assert.equal(wrapper.text(), "OneTwoThree");
      });
    });

    describe("#type", () => {
      it("returns type of root component", () => {
        const wrapper = mount(h("article"));
        assert.equal(wrapper.type(), "article");
      });

      it("returns `null` for a text component", () => {
        const wrapper = mount(h("button", {}, "Label"));
        assert.strictEqual(wrapper.children().type(), null);
      });
    });

    describe("#unmount", () => {
      it("unmounts component", () => {
        const wrapper = mount(h("div"));
        const dom = wrapper.getDOMNode();
        assert.notEqual(dom.parentNode, null);

        wrapper.unmount();

        assert.equal(dom.parentNode, null);
      });

      it("unmounts root component", () => {
        const wrapper = mount(h("div", {}, h("button")));
        const dom = wrapper.getDOMNode();
        assert.notEqual(dom.parentNode, null);

        wrapper.find("button").unmount();

        assert.equal(dom.parentNode, null);
      });
    });

    // TODO - #update
  });
});
