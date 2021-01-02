import { registerContext, useRef } from "./hooks.js";

export class ContextProvider<T> {
  private _listeners: Array<() => void>;

  type: object;
  value: T;

  constructor(type: object, initialValue: T) {
    this._listeners = [];

    this.type = type;
    this.value = initialValue;
  }

  subscribe(listener: () => void) {
    this._listeners.push(listener);
  }

  unsubscribe(listener: () => void) {
    this._listeners = this._listeners.filter((fn) => fn !== listener);
  }

  setValue(value: T) {
    if (!Object.is(this.value, value)) {
      this.value = value;
      this._listeners.forEach((fn) => fn());
    }
  }
}

export function createContext<T>(defaultValue: T) {
  const contextType = {
    Provider: (props: { children: any; value?: T }) => {
      const provider = useRef<ContextProvider<T> | null>(null);
      if (!provider.current) {
        provider.current = new ContextProvider(contextType, defaultValue);
        registerContext(provider.current);
      }

      // Per React docs [1], the `value` prop is used if present, even if `undefined`.
      // Otherwise `defautlValue` is used.
      //
      // [1] https://reactjs.org/docs/context.html#reactcreatecontext.
      const currentValue = "value" in props ? props.value! : defaultValue;

      provider.current.setValue(currentValue);
      return props.children;
    },
  };
  return contextType;
}
