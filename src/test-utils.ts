import { getRoots } from "./render";

function flushAllRoots() {
  for (let root of getRoots()) {
    root.flush();
  }
}

export function act(callback: (() => void) | (() => Promise<any>)) {
  const result = callback();
  if (result != null && typeof result.then === "function") {
    return result.then(flushAllRoots);
  } else {
    flushAllRoots();
  }
}
