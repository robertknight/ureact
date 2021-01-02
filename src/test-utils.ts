import { getRoots } from "./render";

export function act(callback: () => void) {
  callback();

  for (let root of getRoots()) {
    root.flush();
  }
}
