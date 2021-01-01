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

type Hook = RefHook<any> | StateHook<any>;

export class HookState {
  private _index: number;
  private _hooks: Hook[];
  private _scheduleUpdate: () => void;

  constructor(updater: () => void) {
    this._index = -1;
    this._hooks = [];
    this._scheduleUpdate = updater;
  }

  _nextHook<T extends RefHook<any> | StateHook<any>>() {
    ++this._index;
    return this._hooks[this._index] as T | undefined;
  }

  resetIndex() {
    this._index = -1;
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

export function useRef<T>(initialValue: T) {
  return getHookState().useRef(initialValue);
}

export function useState<S>(initialState: S) {
  return getHookState().useState(initialState);
}
