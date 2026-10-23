import { type UpPhase, UpPhaseSchema } from "@src/services/vpnService.ts";

/** Progress floor while connecting: a sliver is visible before the first phase arrives. */
const PROGRESS_FLOOR_PCT = 8;

/** How far along the 12 ordered up-phases a connect is, 8–100 %. */
export function connectProgress(phase: UpPhase | null | undefined): number {
  if (!phase) return PROGRESS_FLOOR_PCT;
  const phases = UpPhaseSchema.options;
  const idx = phases.indexOf(phase);
  return Math.max(PROGRESS_FLOOR_PCT, ((idx + 1) / phases.length) * 100);
}

/**
 * The four user-facing steps of a connect, in order. The last one names the
 * exit, so it is a function of the destination's title.
 */
export const CONNECT_STEPS = [
  "Starting the mixnode in the app",
  "Opening a HOPR session through a relay",
  "Securing the tunnel",
  (title: string) => `Reaching the exit in ${title}`,
] as const;

export const CONNECT_STEP_COUNT = CONNECT_STEPS.length;

const STEP_OF_PHASE: Record<UpPhase, number> = {
  Init: 0,
  ResolvingBlokliIps: 0,
  GeneratingWg: 1,
  OpeningBridge: 1,
  RegisterWg: 1,
  OpeningPing: 2,
  GatherPeerIps: 2,
  KillswitchLockdown: 2,
  EstablishWgTunnel: 2,
  VerifyPing: 3,
  AdjustToMain: 3,
  ConnectionEstablished: 3,
};

/** Which of the four steps a phase belongs to; null while no phase is known (a reconnect waiting on a route). */
export function connectStep(phase: UpPhase | null | undefined): number | null {
  return phase ? STEP_OF_PHASE[phase] : null;
}

/** The text of a step, with the exit's title filled into the last one. */
export function connectStepText(step: number, title: string): string {
  const entry = CONNECT_STEPS[step];
  return typeof entry === "function" ? entry(title) : entry;
}
