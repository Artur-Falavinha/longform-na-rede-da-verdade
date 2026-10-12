import type { Dispose, MediaId } from "../../data/types";
export type PauseReason =
  | "initial"
  | "manual"
  | "visibility"
  | "coordinator"
  | "reduced-motion"
  | "error"
  | null;
type MediaState = {
  element: HTMLMediaElement;
  reason: PauseReason;
  expectedPause: boolean;
  request: number;
  dispose: Dispose;
};
export type MediaCoordinator = ReturnType<typeof createMediaCoordinator>;
export function createMediaCoordinator() {
  const registry = new Map<MediaId, MediaState>();
  let sequence = 0;
  let latestAudibleRequest = 0;
  const audible = (element: HTMLMediaElement) =>
    !element.muted && element.volume > 0;
  function pause(id: MediaId, reason: PauseReason) {
    const state = registry.get(id);
    if (!state) return;
    state.reason = reason;
    if (state.element.paused) return;
    state.expectedPause = true;
    state.element.pause();
  }
  function claimAudio(id: MediaId, newRequest = false) {
    const state = registry.get(id);
    if (!state || state.element.paused || !audible(state.element)) return;
    if (newRequest || !state.request) state.request = ++sequence;
    if (state.request < latestAudibleRequest) {
      pause(id, "coordinator");
      return;
    }
    latestAudibleRequest = state.request;
    for (const [otherId, other] of registry) {
      if (otherId !== id && !other.element.paused && audible(other.element))
        pause(otherId, "coordinator");
    }
  }
  function register(id: MediaId, element: HTMLMediaElement): Dispose {
    registry.get(id)?.dispose();
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const state: MediaState = {
      element,
      reason: "initial",
      expectedPause: false,
      request: 0,
      dispose,
    };
    function dispose() {
      controller.abort();
      if (registry.get(id) === state) registry.delete(id);
    }
    registry.set(id, state);
    element.addEventListener(
      "play",
      () => {
        state.reason = null;
        claimAudio(id, state.request === 0);
      },
      options,
    );
    element.addEventListener("playing", () => claimAudio(id), options);
    element.addEventListener(
      "volumechange",
      () => claimAudio(id, true),
      options,
    );
    element.addEventListener(
      "pause",
      () => {
        if (!state.expectedPause && !element.ended) state.reason = "manual";
        state.expectedPause = false;
        state.request = 0;
      },
      options,
    );
    element.addEventListener(
      "ended",
      () => {
        state.reason = "manual";
        state.request = 0;
      },
      options,
    );
    return dispose;
  }
  function canAutoplay(id: MediaId) {
    const reason = registry.get(id)?.reason;
    return reason === "initial" || reason === "visibility";
  }
  async function play(id: MediaId, intent: "user" | "automatic") {
    const state = registry.get(id);
    if (!state || (intent === "automatic" && !canAutoplay(id))) return false;
    state.request = ++sequence;
    const request = state.request;
    if (audible(state.element)) latestAudibleRequest = request;
    state.reason = null;
    try {
      await state.element.play();
      claimAudio(id);
      return !state.element.paused;
    } catch {
      if (
        state.request === request &&
        state.reason !== "coordinator" &&
        state.reason !== "visibility"
      )
        state.reason = "error";
      return false;
    }
  }
  return {
    register,
    pause,
    play,
    canAutoplay,
    reason: (id: MediaId): PauseReason => registry.get(id)?.reason ?? null,
    dispose() {
      for (const state of [...registry.values()]) state.dispose();
    },
  };
}
