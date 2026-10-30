import { describe, expect, it } from "vitest";
import {
  SYNC_SCRIPT,
  syncAnimationSecondsAt,
  syncCaptionAt,
} from "./syncScript.ts";

const LAST_CAPTION = "Same exit, a different route each time";

describe("syncAnimationSecondsAt", () => {
  it("plays the whole animation once", () => {
    expect(syncAnimationSecondsAt(0, 120)).toBe(0);
    expect(syncAnimationSecondsAt(62.5, 120)).toBe(62.5);
    expect(syncAnimationSecondsAt(119.9, 120)).toBe(119.9);
  });

  it("then repeats only the last caption's 20 s", () => {
    expect(syncAnimationSecondsAt(120, 120)).toBe(100);
    expect(syncAnimationSecondsAt(130, 120)).toBe(110);
    expect(syncAnimationSecondsAt(140, 120)).toBe(100);
    expect(syncAnimationSecondsAt(1000, 120)).toBe(100);
  });

  it("keeps the last caption up through every repeat", () => {
    for (let elapsed = 120; elapsed < 400; elapsed += 0.5) {
      expect(syncCaptionAt(syncAnimationSecondsAt(elapsed, 120))).toBe(
        LAST_CAPTION,
      );
    }
  });

  it("loops a replacement shorter than the script whole", () => {
    expect(syncAnimationSecondsAt(95, 90)).toBe(5);
  });
});

describe("syncCaptionAt", () => {
  it("shows nothing before the first cue", () => {
    expect(syncCaptionAt(0)).toBeNull();
    expect(syncCaptionAt(0.99)).toBeNull();
  });

  it("switches exactly on each cue", () => {
    for (const [i, cue] of SYNC_SCRIPT.entries()) {
      expect(syncCaptionAt(cue.at)).toBe(cue.text);
      if (i > 0) {
        expect(syncCaptionAt(cue.at - 0.01)).toBe(SYNC_SCRIPT[i - 1].text);
      }
    }
  });

  it("holds the last cue to the end of the timeline", () => {
    expect(syncCaptionAt(119.99)).toBe(LAST_CAPTION);
  });
});
