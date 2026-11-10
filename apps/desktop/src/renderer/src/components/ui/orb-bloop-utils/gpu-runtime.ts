export interface GpuGateState {
  lowPower: boolean;
  paused: boolean;
}

export interface GpuGate {
  state: GpuGateState;
  frameMs?: number;
  dispose: () => void;
}

export function attachGpuGate(_canvas: HTMLCanvasElement): GpuGate {
  const state: GpuGateState = {
    lowPower: false,
    paused: false,
  };

  const handleVisibility = () => {
    state.paused = document.hidden;
  };

  document.addEventListener("visibilitychange", handleVisibility);

  return {
    state,
    frameMs: 16,
    dispose: () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    },
  };
}

export function deferUntilVisible(
  element: HTMLElement,
  callback: () => void
): () => void {
  if (typeof IntersectionObserver === "undefined") {
    callback();
    return () => {};
  }

  let invoked = false;
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !invoked) {
      invoked = true;
      observer.disconnect();
      callback();
    }
  });

  observer.observe(element);
  return () => {
    observer.disconnect();
  };
}
