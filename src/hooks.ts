export let currentHooks: HookState | null = null;

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

interface EffectHook {
  type: "effect";
  deps: any[] | null;
  cleanup: (() => void) | null;
  pendingEffect: (() => EffectCleanup) | null;
}

type Hook = EffectHook | MemoHook<any> | RefHook<any> | StateHook<any>;

function shallowEqual(a: any[], b: any[]) {
  return a.length === b.length && a.every((v, i) => b[i] === v);
}

export class HookState {
  private _index: number;
  private _hooks: Hook[];
  private _scheduleUpdate: () => void;
  private _scheduleEffects: () => void;

  constructor(scheduleUpdate: () => void, scheduleEffects: () => void) {
    this._index = -1;
    this._hooks = [];
    this._scheduleUpdate = scheduleUpdate;
    this._scheduleEffects = scheduleEffects;
  }

  _nextHook<T extends Hook>() {
    ++this._index;
    return this._hooks[this._index] as T | undefined;
  }

  resetIndex() {
    this._index = -1;
  }

  runEffects() {
    for (let hook of this._hooks) {
      if (hook.type === "effect" && hook.pendingEffect) {
        hook.cleanup = hook.pendingEffect() || null;
        hook.pendingEffect = null;
      }
    }
  }

  cleanup() {
    for (let hook of this._hooks) {
      if (hook.type === "effect" && hook.cleanup) {
        hook.cleanup();
        hook.cleanup = null;
      }
    }
  }

  useEffect(effect: () => void, deps?: any[]) {
    let hook = this._nextHook<EffectHook>();
    if (!hook) {
      hook = {
        type: "effect",
        pendingEffect: effect,
        deps: deps ?? null,
        cleanup: null,
      };
      this._hooks.push(hook);
      this._scheduleEffects();
    } else if (!deps || !hook.deps || !shallowEqual(hook.deps, deps)) {
      if (hook.cleanup) {
        hook.cleanup();
        hook.cleanup = null;
      }
      hook.pendingEffect = effect;
      this._scheduleEffects();
    }
  }

  useMemo<T>(callback: () => T, deps: any[]) {
    let hook = this._nextHook<MemoHook<T>>();
    if (!hook) {
      hook = {
        type: "memo",
        result: callback(),
        deps,
      };
      this._hooks.push(hook);
    } else if (!shallowEqual(hook.deps, deps)) {
      hook.result = callback();
      hook.deps = deps;
    }
    return hook.result;
  }

  useCallback<F extends Function>(callback: F, deps: any[]) {
    let hook = this._nextHook<MemoHook<F>>();
    if (!hook) {
      hook = {
        type: "memo",
        result: callback,
        deps,
      };
      this._hooks.push(hook);
    } else if (!shallowEqual(hook.deps, deps)) {
      hook.result = callback;
      hook.deps = deps;
    }
    return hook.result;
  }

  useState<S>(initialState: S | (() => S)) {
    let hook = this._nextHook<StateHook<S>>();
    if (!hook) {
      const setter = (newState: S | ((current: S) => S)) => {
        hook!.value =
          typeof newState === "function"
            ? (newState as any)(hook!.value)
            : newState;
        this._scheduleUpdate();
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

  useRef<T>(initialValue: T) {
    let hook = this._nextHook<RefHook<T>>();
    if (!hook) {
      hook = { type: "ref", current: initialValue };
      this._hooks.push(hook);
    }
    return hook;
  }
}

export function setHookState(hs: HookState | null) {
  currentHooks = hs;
  hs?.resetIndex();
}

function getHookState() {
  if (!currentHooks) {
    throw new Error("Hook called outside of component");
  }
  return currentHooks;
}

export function useEffect(effect: () => void, deps?: any[]) {
  return getHookState().useEffect(effect, deps);
}

export function useCallback<F extends Function>(callback: F, deps: any[]) {
  return getHookState().useCallback(callback, deps);
}

export function useMemo<T>(callback: () => T, deps: any[]) {
  return getHookState().useMemo(callback, deps);
}

export function useRef<T>(initialValue: T) {
  return getHookState().useRef(initialValue);
}

export function useState<S>(initialState: S) {
  return getHookState().useState(initialState);
}
