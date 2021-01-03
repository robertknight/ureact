import { getRoots } from "./render.js";

let actDepth = 0;

function flushAllRoots() {
  if (actDepth > 0) {
    // When `act` is re-entered, flushing only happens when the outermost call returns.
    return;
  }

  for (let root of getRoots()) {
    root.flush();
  }
}

export function act(
  callback: (() => void) | (() => Promise<any>)
): void | Promise<void> {
  ++actDepth;

  const result = callback();

  if (result != null && typeof result.then === "function") {
    return result.then(() => {
      --actDepth;
      flushAllRoots();
    });
  } else {
    --actDepth;
    flushAllRoots();
  }
}
