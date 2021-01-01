export let currentHooks: HookState | null = null;

interface StateHook<S> {
  type: "state";
  value: S;
  setter: (newState: S) => void;
}

export class HookState {
  private _index: number;
  private _hooks: StateHook<any>[];
  private _scheduleUpdate: () => void;

  constructor(updater: () => void) {
    this._index = -1;
    this._hooks = [];
    this._scheduleUpdate = updater;
  }

  resetIndex() {
    this._index = -1;
  }

  useState<S>(initialState: S | (() => S)) {
    ++this._index;
    let hook = this._hooks[this._index];
    if (!hook) {
      const setter = (newState: S | ((current: S) => S)) => {
        hook.value =
          typeof newState === "function"
            ? (newState as any)(hook.value)
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

export function useState<S>(initialState: S) {
  return getHookState().useState(initialState);
}
