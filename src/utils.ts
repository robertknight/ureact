import { Props, Ref } from "./jsx";

export function Fragment(props: Props) {
  return props.children;
}

export function createRef<T>(): Ref<T | null> {
  return { current: null };
}
