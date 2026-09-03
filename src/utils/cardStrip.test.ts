import { describe, expect, it } from "vitest";

import type { DestinationEntry } from "@src/stores/destinationMode.ts";
import { reconcileStrip } from "./cardStrip.ts";

const entry = (id: string, key: number): DestinationEntry => ({
  id,
  key,
  wasActive: true,
});

describe("reconcileStrip", () => {
  it("passes the model's entries straight through when nothing left", () => {
    const model = [entry("a", 0), entry("b", 1)];

    const frame = reconcileStrip(model, model, [0, 1], 1);

    expect(frame.shown.map((e) => e.id)).toEqual(["a", "b"]);
    expect(frame.fadingKeys).toEqual([]);
  });

  it("keeps a removed card in its own slot so neighbours do not shift", () => {
    const shown = [entry("a", 0), entry("b", 1), entry("c", 2)];

    const frame = reconcileStrip(
      shown,
      [entry("a", 0), entry("c", 2)],
      [0, 1, 2],
      0,
    );

    expect(frame.shown.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(frame.fadingKeys).toEqual([1]);
  });

  it("drops the replaced card at once when a pick takes its slot", () => {
    const shown = [entry("a", 0), entry("b", 1)];

    // b was active and the pick minted c with a fresh key in b's place
    const frame = reconcileStrip(
      shown,
      [entry("a", 0), entry("c", 2)],
      [0, 1],
      1,
    );

    expect(frame.shown.map((e) => e.id)).toEqual(["a", "c"]);
    expect(frame.fadingKeys, "a swap is not a fade").toEqual([]);
  });

  it("holds a card that is still fading while another one leaves", () => {
    const shown = [entry("a", 0), entry("b", 1), entry("c", 2)];

    const frame = reconcileStrip(shown, [entry("a", 0)], [0, 2], null);

    expect(frame.shown.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(frame.fadingKeys, "b already left on an earlier frame").toEqual([2]);
  });

  it("reuses the object already on screen so a card repositions instead of remounting", () => {
    const shownB = entry("b", 1);

    const frame = reconcileStrip(
      [entry("a", 0), shownB],
      [entry("b", 1), entry("a", 0)],
      [0, 1],
      0,
    );

    expect(frame.shown[0]).toBe(shownB);
  });

  it("empties out when the model has nothing left to show", () => {
    const frame = reconcileStrip([entry("a", 0)], [], [0], null);

    expect(frame.shown.map((e) => e.id)).toEqual(["a"]);
    expect(frame.fadingKeys).toEqual([0]);
  });
});
