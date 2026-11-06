import { CONNECT_PHASES, type ConnectPhase } from "@src/services/vpnService.ts";

/** The Stage 2.1 mock's four connect steps, by index. */
export type StageStep = 0 | 1 | 2 | 3;

export const STAGE_STEP_COUNT = 4;

const PHASE_STEP: Record<ConnectPhase, StageStep> = {
  init: 0,
  gather_peer_ips: 0,
  killswitch_lockdown: 0,
  generating_wg: 1,
  register_wg: 1,
  opening_ping: 1,
  establish_wg_tunnel: 2,
  verify_ping: 3,
  adjust_to_main: 3,
  connection_established: 3,
};

/** Where on the mock's 0–1 timeline each phase starts; a step owns a quarter of it. */
const PHASE_START: Record<ConnectPhase, number> = {
  init: 0,
  gather_peer_ips: 0.08,
  killswitch_lockdown: 0.17,
  generating_wg: 0.25,
  register_wg: 0.33,
  opening_ping: 0.41,
  establish_wg_tunnel: 0.5,
  verify_ping: 0.75,
  adjust_to_main: 0.85,
  connection_established: 0.95,
};

// Short enough to read as a response, long enough not to jump.
const CATCH_UP_SEC = 0.25;
// A long phase still moves, but never reaches the next phase's start.
const CREEP_SEC = 6;
const CREEP_HEADROOM = 0.02;
const SNAP = 0.002;

/** A phase-less attempt (a switch tearing down, or a wait for route) has not started connecting yet. */
export function stageStep(phase: ConnectPhase | null): StageStep {
  return phase === null ? 0 : PHASE_STEP[phase];
}

export function phaseStart(phase: ConnectPhase | null): number {
  return phase === null ? 0 : PHASE_START[phase];
}

/** The furthest a phase may creep: just short of the next phase's start. */
export function phaseCap(phase: ConnectPhase | null): number {
  const index = phase === null ? 0 : CONNECT_PHASES.indexOf(phase);
  const next = CONNECT_PHASES[index + 1];
  return next === undefined ? 1 : PHASE_START[next] - CREEP_HEADROOM;
}

function approach(
  from: number,
  to: number,
  dtSec: number,
  tauSec: number,
): number {
  return from + (to - from) * (1 - Math.exp(-dtSec / tauSec));
}

/** One frame of the shown progress: catch up to the phase, then creep toward the next one. */
export function advanceProgress(
  shown: number,
  phase: ConnectPhase | null,
  dtSec: number,
): number {
  const start = phaseStart(phase);
  const cap = phaseCap(phase);
  // a restarted attempt winds back rather than creeping on from where the last one stood
  if (shown > cap || shown < start - SNAP) {
    const next = approach(shown, start, dtSec, CATCH_UP_SEC);
    return Math.abs(next - start) < SNAP ? start : next;
  }
  return approach(shown, cap, dtSec, CREEP_SEC);
}

/** The mock's ease-in-out cubic. */
export function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

/** A value on the timeline: `from` until `begin`, eased into `to` over `span`. */
export function tween(
  progress: number,
  from: number,
  to: number,
  begin: number,
  span: number,
): number {
  if (progress <= begin) return from;
  const p = span > 0 ? Math.min(1, (progress - begin) / span) : 1;
  return from + (to - from) * easeInOut(p);
}

/** `text` cut to `max` characters, the last an ellipsis when cut; counts code points so no surrogate pair splits. */
export function clampLabel(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}
