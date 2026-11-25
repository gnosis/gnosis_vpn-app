import {
  CONNECT_STEPS,
  type ConnectIssue,
  type ConnectStep,
} from "@src/services/vpnService.ts";

/** The Stage 2.1 mock's four connect steps, by index. */
export type StageStep = 0 | 1 | 2 | 3;

export const STAGE_STEP_COUNT = 4;

const STEP_STAGE: Record<ConnectStep, StageStep> = {
  checking_exit: 0,
  securing: 1,
  opening_tunnel: 2,
  paying_requested: 3,
  paying_sent: 3,
  verifying: 3,
};

/** Where on the mock's 0–1 timeline each step starts; a stage owns a quarter of it. */
const STEP_START: Record<ConnectStep, number> = {
  checking_exit: 0,
  securing: 0.25,
  opening_tunnel: 0.5,
  paying_requested: 0.75,
  paying_sent: 0.82,
  verifying: 0.9,
};

// Short enough to read as a response, long enough not to jump.
const CATCH_UP_SEC = 0.25;
// A long step still moves, but never reaches the next step's start.
const CREEP_SEC = 6;
const CREEP_HEADROOM = 0.02;
const SNAP = 0.002;

/** A step-less attempt (a switch tearing down, or a wait for route) has not started connecting yet. */
export function stageStep(step: ConnectStep | null): StageStep {
  return step === null ? 0 : STEP_STAGE[step];
}

export function stepStart(step: ConnectStep | null): number {
  return step === null ? 0 : STEP_START[step];
}

/** The furthest a step may creep: just short of the next step's start. */
export function stepCap(step: ConnectStep | null): number {
  const index = step === null ? 0 : CONNECT_STEPS.indexOf(step);
  const next = CONNECT_STEPS[index + 1];
  return next === undefined ? 1 : STEP_START[next] - CREEP_HEADROOM;
}

const ISSUE_TEXT: Record<ConnectIssue["kind"], (exit: string) => string> = {
  exit_unreachable: (exit) => `The exit in ${exit} does not answer`,
  payment_route_unavailable: (exit) =>
    `The exit in ${exit} cannot reach the payment service`,
  registration_failed: (exit) => `The exit in ${exit} did not accept the key`,
  payment_failed: (exit) => `Paying the exit in ${exit} failed`,
  insufficient_funds: (exit) => `Not enough funds to pay the exit in ${exit}`,
  tunnel_unverified: (exit) => `The tunnel to ${exit} does not answer yet`,
  other: (exit) => `Connecting to ${exit} failed`,
};

/** The daemon retries every issue in place, so the caption counts the retries. */
export function issueCaption(issue: ConnectIssue, exitName: string): string {
  return `${ISSUE_TEXT[issue.kind](exitName)} · retry ${issue.attempts}`;
}

function approach(
  from: number,
  to: number,
  dtSec: number,
  tauSec: number,
): number {
  return from + (to - from) * (1 - Math.exp(-dtSec / tauSec));
}

/** One frame of the shown progress: catch up to the step, then creep toward the next one. */
export function advanceProgress(
  shown: number,
  step: ConnectStep | null,
  dtSec: number,
): number {
  const start = stepStart(step);
  const cap = stepCap(step);
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
