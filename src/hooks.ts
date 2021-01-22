import { ContextProvider } from "./context.js";

interface StateHook<S> {
  type: "state";
  value: S;
  setter: (newState: S) => void;
}

interface RefHook<T> {
  type: "ref";
  current: T;
}

interface MemoHook<T> {
  type: "memo";
  result: T;
  deps: any[];
}

type EffectCleanup = (() => void) | void;

/** Specifies when an effect should run. */
export const enum EffectTiming {
  /** Run effect after DOM is updated but before the screen is updated. */
  beforeRender = 0,
  /** Run effect after DOM is updated and screen has been updated to reflect this. */
  afterRender = 1,
}

interface EffectHook {
  type: "effect";
  when: EffectTiming;
  deps: any[] | null;
  cleanup: (() => void) | null;
  pendingEffect: (() => EffectCleanup) | null;
}

interface ContextHook<T> {
  type: "context";
  provider: { value: T };
  unsubscribe: () => void;
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
  /** Schedule a re-render of this component due to a state or context update. */
  scheduleUpdate(): void;

  /** Schedule execution of pending effects for this component. */
  scheduleEffects(when: EffectTiming): void;

  /** Get the nearest provider of context of a given type for this component. */
  getContext<T>(type: any): ContextProvider<T> | null;

  /** Register this component as a provider of context. */
  registerContext<T>(provider: ContextProvider<T>): void;
}

function depsEqual(a: any[], b: any[]) {
  return a.length === b.length && a.every((v, i) => b[i] === v);
}

export class HookState {
  private _index: number;
  private _hooks: Hook[];
  private _component;

  constructor(component: Component) {
    this._index = -1;
    this._hooks = [];
    this._component = component;
  }

  _nextHook<T extends Hook>(type: string) {
    ++this._index;
    const hook = this._hooks[this._index] as T | undefined;
    if (hook && hook.type !== type) {
      throw new Error(
        "Hook type mismatch. Hooks must be called in same order on each render."
      );
    }
    return hook;
  }

  resetIndex() {
    this._index = -1;
  }

  runEffects(when: EffectTiming) {
    for (let hook of this._hooks) {
      if (hook.type === "effect" && hook.when === when && hook.pendingEffect) {
        hook.cleanup = hook.pendingEffect() || null;
        hook.pendingEffect = null;
      }
    }
  }

  cleanup() {
    for (let hook of this._hooks) {
      switch (hook.type) {
        case "context":
          hook.unsubscribe();
          break;
        case "effect":
          if (hook.cleanup) {
            hook.cleanup();
            hook.cleanup = null;
          }
          break;
      }
    }
  }

  registerContext<T>(provider: ContextProvider<T>) {
    this._component.registerContext(provider);
  }

  useEffect(
    effect: () => void,
    deps?: any[],
    when: EffectTiming = EffectTiming.afterRender
  ) {
    let hook = this._nextHook<EffectHook>("effect");
    if (!hook) {
      hook = {
        type: "effect",
        when,
        pendingEffect: effect,
        deps: deps ?? null,
        cleanup: null,
      };
      this._hooks.push(hook);
      this._component.scheduleEffects(when);
    } else if (!deps || !hook.deps || !depsEqual(hook.deps, deps)) {
      if (hook.cleanup) {
        hook.cleanup();
        hook.cleanup = null;
      }
      hook.pendingEffect = effect;
      hook.deps = deps ?? null;
      this._component.scheduleEffects(when);
    }
  }

  useLayoutEffect(effect: () => void, deps?: any[]) {
    return this.useEffect(effect, deps, EffectTiming.beforeRender);
  }

  useMemo<T>(callback: () => T, deps: any[]) {
    let hook = this._nextHook<MemoHook<T>>("memo");
    if (!hook) {
      hook = {
        type: "memo",
        result: callback(),
        deps,
      };
      this._hooks.push(hook);
    } else if (!depsEqual(hook.deps, deps)) {
      hook.result = callback();
      hook.deps = deps;
    }
    return hook.result;
  }

  useCallback<F extends Function>(callback: F, deps: any[]) {
    let hook = this._nextHook<MemoHook<F>>("memo");
    if (!hook) {
      hook = {
        type: "memo",
        result: callback,
        deps,
      };
      this._hooks.push(hook);
    } else if (!depsEqual(hook.deps, deps)) {
      hook.result = callback;
      hook.deps = deps;
    }
    return hook.result;
  }

  useContext<T>(type: any): T {
    let hook = this._nextHook<ContextHook<T>>("context");
    if (!hook) {
      const provider = this._component.getContext<T>(type);
      if (provider) {
        const listener = () => this._component.scheduleUpdate();
        const unsubscribe = () => provider.unsubscribe(listener);
        hook = { type: "context", provider, unsubscribe };
        provider.subscribe(listener);
      } else {
        const provider = { value: type.defaultValue };
        hook = { type: "context", provider, unsubscribe: () => {} };
      }
      this._hooks.push(hook);
    }
    return hook.provider.value;
  }

  useState<S>(initialState: S | (() => S)) {
    let hook = this._nextHook<StateHook<S>>("state");
    if (!hook) {
      const setter = (newState: S | ((current: S) => S)) => {
        hook!.value =
          typeof newState === "function"
            ? (newState as any)(hook!.value)
            : newState;
        this._component.scheduleUpdate();
      };
      const value =
        typeof initialState === "function"
          ? (initialState as any)()
          : initialState;
      hook = { type: "state", value, setter };
      this._hooks.push(hook);
    }
    return [hook.value, hook.setter];
  }

  useReducer<S>(
    reducer: (state: S, action: any) => S,
    initialArg: S,
    init?: (a: typeof initialArg) => S
  ) {
    let hook = this._nextHook<StateHook<S>>("state");
    if (!hook) {
      const dispatch = (action: any) => {
        const newState = reducer(hook!.value, action);
        if (!Object.is(hook!.value, newState)) {
          hook!.value = newState;
          this._component.scheduleUpdate();
        }
      };
      const value =
        typeof init === "function" ? init(initialArg) : (initialArg as S);
      hook = { type: "state", value, setter: dispatch };
      this._hooks.push(hook);
    }
    return [hook.value, hook.setter];
  }

  useRef<T>(initialValue: T) {
    let hook = this._nextHook<RefHook<T>>("ref");
    if (!hook) {
      hook = { type: "ref", current: initialValue };
      this._hooks.push(hook);
    }
    return hook;
  }
}

let currentHooks: (() => HookState) | null = null;

export function setHookState(hs: (() => HookState) | null) {
  currentHooks = hs;
}

function getHookState() {
  if (!currentHooks) {
    throw new Error("Hook called outside of component");
  }
  return currentHooks();
}

export function registerContext<T>(provider: ContextProvider<T>) {
  getHookState().registerContext(provider);
}

export function useCallback<F extends Function>(callback: F, deps: any[]) {
  return getHookState().useCallback(callback, deps);
}

export function useEffect(effect: () => void, deps?: any[]) {
  return getHookState().useEffect(effect, deps);
}

export function useLayoutEffect(effect: () => void, deps?: any[]) {
  return getHookState().useLayoutEffect(effect, deps);
}

export function useContext(type: object): any {
  return getHookState().useContext(type);
}

export function useMemo<T>(callback: () => T, deps: any[]) {
  return getHookState().useMemo(callback, deps);
}

export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialArg: S,
  init?: (arg: S) => S
) {
  return getHookState().useReducer(reducer, initialArg, init);
}

export function useRef<T>(initialValue: T) {
  return getHookState().useRef(initialValue);
}

export function useState<S>(initialState: S) {
  return getHookState().useState(initialState);
}
