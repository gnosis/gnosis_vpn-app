/** Captions for the sync animation, keyed to its timeline in seconds (#568). */
export const SYNC_SCRIPT: readonly { at: number; text: string }[] = [
  { at: 1, text: "Looking for other node runners" },
  { at: 13, text: "Seeing who answers, and how quickly" },
  { at: 25, text: "Putting money aside to pay them" },
  { at: 40, text: "Trying routes through the network" },
  { at: 62, text: "Finding an exit with room" },
  { at: 88, text: "Sending out, hearing back a different way" },
  { at: 100, text: "Same exit, a different route each time" },
];

/** Caption for a point on the animation timeline, or null before the first cue. */
export function syncCaptionAt(animationSeconds: number): string | null {
  let caption: string | null = null;
  for (const cue of SYNC_SCRIPT) {
    if (cue.at > animationSeconds) break;
    caption = cue.text;
  }
  return caption;
}
