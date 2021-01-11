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
- [Hooks](https://reactjs.org/docs/hooks-intro.html)
- Important utilities such as `Fragment` and `memo`
- The `act` test utility
- The modern [Context](https://reactjs.org/docs/context.html) API

It intentionally does not support:

- Class components with lifecycle methods
- The [concurrent mode](https://reactjs.org/docs/concurrent-mode-intro.html) APIs
  such as `Suspense`
- The legacy context API
- [Synthetic events](https://reactjs.org/docs/events.html). Event handlers get
  native DOM events instead
- Testing APIs other than `act`
- Rendering to non-DOM targets

## Supported browsers

ureact is intended to work on modern (think post-2017) browsers. It does not support
IE 11 or similar vintage browsers. It also works with JSDOM in a test environment.

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
