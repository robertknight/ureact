import { JSDOM } from "jsdom";

import { render, unmountComponentAtNode } from "../../build/index.js";

/**
 * An isolated DOM environment for use in rendering tests.
 */
class Scratchpad {
  /** Setup the JSDOM environment. */
  constructor() {
    this.jsdom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    this.container = this.document.createElement("div");
  }

  /**
   * Unmount any rendered content in the scratchpad.
   *
   * This should be called before each test runs.
   */
  reset() {
    unmountComponentAtNode(this.container);
    this.container = this.document.createElement("div");
  }

  /**
   * Render a VNode (aka. "React element") into the scratchpad.
   *
   * This replaces any existing content.
   */
  render(vnode) {
    render(vnode, this.container);
    return this.container;
  }

  /**
   * Unmount any rendered content and cleanup timers etc.
   *
   * This should be called at the end of test suite.
   */
  cleanup() {
    unmountComponentAtNode(this.container);
    this.window.close();
  }

  get document() {
    return this.jsdom.window.document;
  }

  get window() {
    return this.jsdom.window;
  }
}

export function createScratchpad() {
  return new Scratchpad();
}
