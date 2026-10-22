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
