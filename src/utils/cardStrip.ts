import type { DestinationEntry } from "@src/stores/destinationMode.ts";

/** What a strip renders and what is on its way out, given the model's entries and what was shown before. */
export interface StripFrame {
  shown: DestinationEntry[];
  fadingKeys: number[];
}

/** A removed card keeps its slot until its fade finishes, or its neighbours would snap sideways. Keyed, so a re-picked destination mounts fresh. */
export function reconcileStrip(
  shown: DestinationEntry[],
  modelEntries: DestinationEntry[],
  previousModelKeys: number[],
  previousActiveKey: number | null,
): StripFrame {
  const nextKeys = modelEntries.map((entry) => entry.key);
  const arrived = nextKeys.some((key) => !previousModelKeys.includes(key));
  // a pick swaps one card for another in the same slot, so the outgoing one leaves at once
  const replacedKey = arrived ? previousActiveKey : null;
  const isLeaving = (key: number) =>
    !nextKeys.includes(key) && key !== replacedKey;

  const existing = new Map(shown.map((entry) => [entry.key, entry]));
  // reuse the slot objects so <For> repositions cards instead of remounting them
  const next = modelEntries.map((entry) => existing.get(entry.key) ?? entry);
  for (const entry of shown.filter((e) => isLeaving(e.key))) {
    next.splice(Math.min(shown.indexOf(entry), next.length), 0, entry);
  }

  return { shown: next, fadingKeys: previousModelKeys.filter(isLeaving) };
}
