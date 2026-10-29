import { describe, expect, it } from "vitest";
import { SYNC_SCRIPT, syncCaptionAt } from "./syncScript.ts";

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

  it("holds the last cue until the animation loops", () => {
    expect(syncCaptionAt(119.99)).toBe(
      "Same exit, a different route each time",
    );
  });

  it("restarts the script when the animation loops", () => {
    expect(syncCaptionAt(0)).toBeNull();
    expect(syncCaptionAt(1.5)).toBe("Looking for other node runners");
  });
});
