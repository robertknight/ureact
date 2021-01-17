# ureact

ureact is an implementation of the modern [React](https://reactjs.org/) APIs
for building UI components in web applications. It is intended to be a small,
simple and straightforward implementation. It may be of interest if you want
to get a sense of how the React APIs can be implemented, although note that the
actual implementation of React 16+ is quite different (and more complex).

This was created as a personal project to keep me busy for a weekend in December 2020.
If you are looking for a project with somewhat similar goals that is actively supported
by a community of contributors, check out [Preact](https://preactjs.com).

## Supported features

ureact supports the core, modern React APIs for use in the browser. This includes:

- [Function components](https://reactjs.org/docs/components-and-props.html)
- The default and new (React 17+) [methods of transforming JSX](https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)
- [Hooks](https://reactjs.org/docs/hooks-intro.html) for adding state and effects
  to components.
- Important utilities such as [`Fragment`](https://reactjs.org/docs/fragments.html) and [`memo`](https://reactjs.org/docs/react-api.html#reactmemo)
- The modern [Context](https://reactjs.org/docs/context.html) API
- The [`act`](https://reactjs.org/docs/testing-recipes.html#act) test utility

It intentionally does not support:

- Class components with lifecycle methods
- The [concurrent mode](https://reactjs.org/docs/concurrent-mode-intro.html) APIs
  such as `Suspense`
- The [legacy context API](https://reactjs.org/docs/legacy-context.html#gatsby-focus-wrapper)
- [Synthetic events](https://reactjs.org/docs/events.html). Event handlers get
  native DOM events instead
- Testing APIs other than `act`
- Rendering to non-DOM targets. There is no equivalent of React Native or
  React ART for example.

There is currently no server-side rendering / render-to-string support. This
might change in future.

## Supported browsers

ureact is intended to work on modern (~2017 and later) browsers. It does not support
IE 11 or similar vintage browsers. It also works with JSDOM in a test environment.

## API differences from React

Aside from React APIs which ureact intentionally does not support, there are
some other API differences:

- ureact does not have a default export. In React functions can be imported using
  either:

  ```js
  import React from "react";

  React.createElement(...)
  ```

  Or:

  ```js
  import { createElement } from "react";
  createElement(...)
  ```

  The second style is preferred in modern React code and is the only style
  supported by ureact.

  If using a build tool such as Babel or TypeScript, it must be configured
  to translate JSX into calls to `createElement` rather than `React.createElement`.

- Event handlers receive native DOM events rather than synthetic events. In most
  instances this does not require changes to event handler code since React's
  `SyntheticEvent` has the same API as native events and mainly exists to
  normalize historical differences across browsers.

- Since class components are not supported, the API for adding [error boundaries](https://reactjs.org/docs/error-boundaries.html)
  is different. ureact exports an `ErrorBoundary` helper component which is used
  like so:

  ```js
  import { createElement, ErrorBoundary, useState } from "ureact";

  function App() {
    const [error, setError] = useState(null);

    return error ? (
      "Something went wrong"
    ) : (
      <ErrorBoundary handler={setError}>…</ErrorBoundary>
    );
  }
  ```

  The `ErrorBoundary` component could be implemented in React with:

  ```js
  import { Component } from "react";

  export class ErrorBoundary extends Component {
    componentDidCatch(error) {
      this.props.handler(error);
    }

    render({ children }) {
      return children;
    }
  }
  ```

- The rules for determining how to apply a prop to a DOM element are determined
  differently. In the vast majority of cases the end result is the same, but
  ureact uses a generic set of rules rather than rules for specific DOM properties:

  1. If the prop is `style` it sets inline styles
  2. If the prop is `dangerouslySetInnerHTML` it sets `innerHTML`
  3. If the prop name starts with "on", it adds an event handler. The prop name
     after the "on" prefix is used as the event name. If the DOM element has an
     `oneventname` property then the event name is lower-cased (eg. `onClick`
     maps to the `click` event rather than the `Click` event)
  4. If a DOM element has a writable or settable property whose name matches the
     prop, then that DOM property is set
  5. Otherwise the prop sets the attribute whose name matches the prop

  The above list is similar to how Preact works.

  The advantage of using these generic rules is that it applies equally well
  to custom element types and new properties added in future as existing DOM
  properties, providing that these elements/properties follow existing conventions.

## Implementation notes

As well as being based entirely around the modern React APIs, a few implementation
details are notable:

- Everything is in one package with no dependencies
- There is minimal global state. Every _root_, which is created when a ureact
  component is rendered into a container DOM element by `render`, has its own local state.
  This means that different ureact "islands" (eg. different tests in a test suite,
  or different widgets on a page) are unlikely to interfere with one another,
  even if they use different versions of ureact.
- VNodes created by `createElement` are immutable. This could enable various
  compile/runtime optimizations.
- The test suite uses only the public APIs. This is intended to enable tests to
  be run against other React API implementations to check for unexpected behavior
  differences.
- Strict type checking is used. This helped to catch many potential errors during
  development.
- ureact tries to minimize the number of rules for handling specific DOM or
  CSS props. Instead the logic for deciding how to apply a prop to a DOM element
  uses general heuristics.

  This enables greater consistency across all DOM properties/attributes/events as
  well as better generalization to custom element types and new DOM events, properties etc.
  that are added in future. See `src/dom-props.ts` for details.
