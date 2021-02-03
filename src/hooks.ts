import { ContextProvider } from "./context.js";

/** Re-render the component to apply state or context updates. */
export const TASK_UPDATE = 0;

/** Run effects scheduled with `useEffect` */
export const TASK_RUN_EFFECTS = 1;

/** Run effects scheduled with `useLayoutEffect` */
export const TASK_RUN_LAYOUT_EFFECTS = 2;

/**
 * Specifies a type of task that a hook may schedule for a component.
 *
 * This is one of the `TASK_*` constants.
 */
export type Task = number;

interface StateHook<S> {
  type: "state";
  value: S;
  setter: (newState: S) => void;
  cleanup: null;
}

interface RefHook<T> {
  type: "ref";
  current: T;
  cleanup: null;
}

interface MemoHook<T> {
  type: "memo";
  result: T;
  deps: any[];
  cleanup: null;
}

type EffectCleanup = (() => void) | void;

interface EffectHook {
  type: "effect";
  task: Task;
  deps: any[] | null;
  cleanup: (() => void) | null;
  pendingEffect: (() => EffectCleanup) | null;
}

interface ContextHook<T> {
  type: "context";
  provider: { value: T };
  cleanup: (() => void) | null;
}

type Hook =
  | ContextHook<any>
  | EffectHook
  | MemoHook<any>
  | RefHook<any>
  | StateHook<any>;

/**
 * Interface for a component's hooks to interact with the associated component.
 */
export interface Component {
  /** Schedule a task to be executed asynchronously for the current component. */
  schedule(task: Task): void;

  /** Get the nearest provider of context of a given type for this component. */
  getContext<T>(type: any): ContextProvider<T> | null;

  /** Register this component as a provider of context. */
  registerContext<T>(provider: ContextProvider<T>): void;
}

function depsEqual(a: any[], b: any[]) {
  return a.length === b.length && a.every((v, i) => b[i] === v);
}

/**
 * Context object for hooks.
 *
 * Each component that uses hooks will have a `HookState` object that maintains
 * the state of the hooks and provides functions that can be used to trigger
 * updates in the renderer.
 */
export class HookState {
  private _index: number;
  private _hooks: Hook[];

  registerContext: (provider: any) => any;
  getContext: (provider: any) => any;
  schedule: (task: Task) => void;

  constructor({ getContext, registerContext, schedule }: Component) {
    this._index = -1;
    this._hooks = [];
    this.registerContext = registerContext;
    this.getContext = getContext;
    this.schedule = schedule;
  }

  /**
   * Get the next hook and assert that if it already exists, is of the expected `type`.
   */
  nextHook<T extends Hook>(type: string) {
    ++this._index;
    const hook = this._hooks[this._index] as T | undefined;
    if (hook && hook.type !== type) {
      throw new Error(
        "Hook type mismatch. Hooks must be called in same order on each render."
      );
    }
    return hook;
  }

  addHook(h: Hook) {
    this._hooks.push(h);
  }

  /**
   * Reset the next hook index.
   *
   * Called at the start of each render.
   */
  resetIndex() {
    this._index = -1;
  }

  /** Run pending tasks of type `task` for a component. */
  run(task: Task) {
    for (let hook of this._hooks) {
      if (hook.type === "effect" && hook.task === task && hook.pendingEffect) {
        hook.cleanup = hook.pendingEffect() || null;
        hook.pendingEffect = null;
      }
    }
  }

  /** Run cleanup tasks for hooks when a component is unmounted. */
  cleanup() {
    for (let hook of this._hooks) {
      if (hook.cleanup) {
        hook.cleanup();
        hook.cleanup = null;
      }
    }
  }
}

/**
 * Function which creates or returns the `HookState` for the component being rendered.
 *
 * Set to `null` by the renderer when no component is being rendered.
 */
let currentHooks: (() => HookState) | null = null;

/**
 * Callback used by the renderer to set the component being rendered or `null` if nothing
 * is being rendered.
 */
export function setHookState(hs: (() => HookState) | null) {
  currentHooks = hs;
}

/** Get the `HookState` for the component being rendered. */
function getHookState() {
  if (!currentHooks) {
    throw new Error("Hook called outside of component");
  }
  return currentHooks();
}

/**
 * Record the current component as being a provider of context of a given
 * type to descendants.
 */
export function registerContext<T>(provider: ContextProvider<T>) {
  getHookState().registerContext(provider);
}

export function useCallback<F extends Function>(callback: F, deps: any[]) {
  const hs = getHookState();
  let hook = hs.nextHook<MemoHook<F>>("memo");
  if (!hook) {
    hook = {
      type: "memo",
      result: callback,
      deps,
      cleanup: null,
    };
    hs.addHook(hook);
  } else if (!depsEqual(hook.deps, deps)) {
    hook.result = callback;
    hook.deps = deps;
  }
  return hook.result;
}

export function useEffect(
  effect: () => void,
  deps?: any[],
  task = TASK_RUN_EFFECTS
) {
  const hs = getHookState();
  let hook = hs.nextHook<EffectHook>("effect");
  if (!hook) {
    hook = {
      type: "effect",
      task,
      pendingEffect: effect,
      deps: deps ?? null,
      cleanup: null,
    };
    hs.addHook(hook);
    hs.schedule(task);
  } else if (!deps || !hook.deps || !depsEqual(hook.deps, deps)) {
    if (hook.cleanup) {
      hook.cleanup();
      hook.cleanup = null;
    }
    hook.pendingEffect = effect;
    hook.deps = deps ?? null;
    hs.schedule(task);
  }
}

export function useLayoutEffect(effect: () => void, deps?: any[]) {
  return useEffect(effect, deps, TASK_RUN_LAYOUT_EFFECTS);
}

export function useContext<T>(type: any): any {
  const hs = getHookState();
  let hook = hs.nextHook<ContextHook<T>>("context");
  if (!hook) {
    const provider = hs.getContext(type);
    if (provider) {
      const listener = () => hs.schedule(TASK_UPDATE);
      const cleanup = () => provider.unsubscribe(listener);
      hook = { type: "context", provider, cleanup };
      provider.subscribe(listener);
    } else {
      const provider = { value: type.defaultValue };
      hook = { type: "context", provider, cleanup: null };
    }
    hs.addHook(hook);
  }
  return hook.provider.value;
}

export function useMemo<T>(callback: () => T, deps: any[]) {
  const hs = getHookState();
  let hook = hs.nextHook<MemoHook<T>>("memo");
  if (!hook) {
    hook = {
      type: "memo",
      result: callback(),
      deps,
      cleanup: null,
    };
    hs.addHook(hook);
  } else if (!depsEqual(hook.deps, deps)) {
    hook.result = callback();
    hook.deps = deps;
  }
  return hook.result;
}

export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialArg: S,
  init?: (arg: S) => S
) {
  const hs = getHookState();
  let hook = hs.nextHook<StateHook<S>>("state");
  if (!hook) {
    const dispatch = (action: any) => {
      const newState = reducer(hook!.value, action);
      if (!Object.is(hook!.value, newState)) {
        hook!.value = newState;
        hs.schedule(TASK_UPDATE);
      }
    };
    const value =
      typeof init === "function" ? init(initialArg) : (initialArg as S);
    hook = { type: "state", value, setter: dispatch, cleanup: null };
    hs.addHook(hook);
  }
  return [hook.value, hook.setter];
}

export function useRef<T>(initialValue: T) {
  const hs = getHookState();
  let hook = hs.nextHook<RefHook<T>>("ref");
  if (!hook) {
    hook = { type: "ref", current: initialValue, cleanup: null };
    hs.addHook(hook);
  }
  return hook;
}

export function useState<S>(initialState: S) {
  const hs = getHookState();
  let hook = hs.nextHook<StateHook<S>>("state");
  if (!hook) {
    const setter = (newState: S | ((current: S) => S)) => {
      hook!.value =
        typeof newState === "function"
          ? (newState as any)(hook!.value)
          : newState;
      hs.schedule(TASK_UPDATE);
    };
    const value =
      typeof initialState === "function"
        ? (initialState as any)()
        : initialState;
    hook = { type: "state", value, setter, cleanup: null };
    hs.addHook(hook);
  }
  return [hook.value, hook.setter];
}
