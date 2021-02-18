import { dirtyRoots } from "./render.js";

let actDepth = 0;

function flushAllRoots() {
  if (actDepth > 0) {
    // When `act` is re-entered, flushing only happens when the outermost call returns.
    return;
  }

  dirtyRoots.enabled = false;
  for (let root of dirtyRoots.roots) {
    root.flush();
  }
}

export function act(
  callback: (() => void) | (() => Promise<any>)
): void | Promise<void> {
  if (++actDepth === 1) {
    dirtyRoots.enabled = true;
  }

  let result;
  try {
    result = callback();
  } catch (err) {
    --actDepth;
    throw err;
  }

  if (result != null && typeof result.then === "function") {
    return result.finally(() => {
      --actDepth;
      flushAllRoots();
    });
  } else {
    --actDepth;
    flushAllRoots();
  }
}
