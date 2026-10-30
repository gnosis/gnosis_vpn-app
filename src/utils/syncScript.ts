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

/** Timeline position after `elapsedSeconds`: one full play, then only the last cue's stretch on repeat. */
export function syncAnimationSecondsAt(
  elapsedSeconds: number,
  durationSeconds: number,
): number {
  if (elapsedSeconds < durationSeconds) return elapsedSeconds;
  const loopStart = SYNC_SCRIPT[SYNC_SCRIPT.length - 1].at;
  // A replacement animation shorter than the script just loops whole.
  if (loopStart >= durationSeconds) return elapsedSeconds % durationSeconds;
  return loopStart +
    (elapsedSeconds - durationSeconds) % (durationSeconds - loopStart);
}

/** Caption for a point on the animation timeline, or null before the first cue. */
export function syncCaptionAt(animationSeconds: number): string | null {
  let caption: string | null = null;
  for (const cue of SYNC_SCRIPT) {
    if (cue.at > animationSeconds) break;
    caption = cue.text;
  }
  return caption;
}
