/**
 * Unit tests for applyRuntimeStateMessage — the pure state-transition rules for
 * the runtime `state` message: time clamping, play/pause mirroring, loop restart,
 * completion detection, and the UI-update throttle.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRuntimeStateMessage,
  type PlaybackState,
  type PlaybackStateCallbacks,
} from "./playback-state.js";

function makeMedia(audioOwner: "parent" | "self") {
  return {
    audioOwner,
    pauseAll: vi.fn(),
    playAll: vi.fn(),
    mirrorTime: vi.fn(),
  };
}

function makeCallbacks(
  overrides: Partial<PlaybackStateCallbacks> & { audioOwner?: "parent" | "self" } = {},
): PlaybackStateCallbacks & { media: ReturnType<typeof makeMedia> } {
  const media = makeMedia(overrides.audioOwner ?? "self");
  return {
    updateControlsTime: vi.fn(),
    updateControlsPlaying: vi.fn(),
    dispatchEvent: vi.fn(),
    seek: vi.fn(),
    play: vi.fn(),
    getLoop: vi.fn(() => false),
    ...overrides,
    media: media as unknown as PlaybackStateCallbacks["media"],
  } as PlaybackStateCallbacks & { media: ReturnType<typeof makeMedia> };
}

const base = (over: Partial<PlaybackState> = {}): PlaybackState => ({
  currentTime: 0,
  duration: 10,
  paused: true,
  lastUpdateMs: 0,
  ...over,
});

describe("applyRuntimeStateMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("converts frame→time, clamps to duration, and mirrors play state", () => {
    const cb = makeCallbacks();
    const next = applyRuntimeStateMessage({ frame: 30, isPlaying: true }, 30, base(), cb);

    expect(next.currentTime).toBe(1);
    expect(next.paused).toBe(false);
    expect(cb.updateControlsTime).toHaveBeenCalledWith(1, 10);
    expect(cb.updateControlsPlaying).toHaveBeenCalledWith(true);
    expect(cb.dispatchEvent).toHaveBeenCalled();
  });

  it("clamps time that overruns the duration", () => {
    const cb = makeCallbacks();
    const next = applyRuntimeStateMessage({ frame: 600, isPlaying: false }, 30, base(), cb);
    expect(next.currentTime).toBe(10);
  });

  it("emits 'ended' and pauses on completion without loop", () => {
    const cb = makeCallbacks({ getLoop: vi.fn(() => false) });
    const next = applyRuntimeStateMessage(
      { frame: 300, isPlaying: true },
      30,
      base({ paused: false }),
      cb,
    );

    expect(next.paused).toBe(true);
    expect(cb.updateControlsPlaying).toHaveBeenLastCalledWith(false);
    const events = cb.dispatchEvent.mock.calls.map((c) => (c[0] as Event).type);
    expect(events).toContain("ended");
  });

  it("restarts from 0 on completion when looping", () => {
    const cb = makeCallbacks({ getLoop: vi.fn(() => true), audioOwner: "parent" });
    const next = applyRuntimeStateMessage(
      { frame: 300, isPlaying: true },
      30,
      base({ paused: false }),
      cb,
    );

    expect(cb.seek).toHaveBeenCalledWith(0);
    expect(cb.play).toHaveBeenCalled();
    expect(cb.media.pauseAll).toHaveBeenCalled();
    expect(next.paused).toBe(false);
  });

  it("mirrors parent-owned audio on pause and tracks time", () => {
    const cb = makeCallbacks({ audioOwner: "parent" });
    applyRuntimeStateMessage({ frame: 30, isPlaying: false }, 30, base({ paused: false }), cb);

    expect(cb.media.pauseAll).toHaveBeenCalled();
    expect(cb.media.mirrorTime).toHaveBeenCalledWith(1);
  });

  it("starts parent-owned audio when transitioning to playing", () => {
    const cb = makeCallbacks({ audioOwner: "parent" });
    applyRuntimeStateMessage({ frame: 30, isPlaying: true }, 30, base({ paused: true }), cb);
    expect(cb.media.playAll).toHaveBeenCalled();
  });

  it("throttles UI updates when nothing changed within the interval", () => {
    const cb = makeCallbacks();
    // Same paused state (true→true) and a fresh lastUpdateMs means no UI push.
    const next = applyRuntimeStateMessage(
      { frame: 30, isPlaying: false },
      30,
      base({ paused: true, lastUpdateMs: performance.now() }),
      cb,
    );

    expect(next.paused).toBe(true);
    expect(cb.updateControlsTime).not.toHaveBeenCalled();
  });
});
