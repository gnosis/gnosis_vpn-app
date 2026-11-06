// Spec: docs/destinationMode.md — on disagreement the spec is right and this file has a bug.
import { createStore, type Store as SolidStore } from "solid-js/store";

import {
  type Connection,
  connectionDestination,
  type Destination,
  type DestinationState,
  type ProbeView,
} from "@src/services/vpnService.ts";
import {
  type CardPhase,
  isReady,
  rankContext,
  sortByRouteQuality,
} from "@src/utils/destinations.ts";

// Countdown before auto switches the card to a better destination
export const SWITCH_COUNTDOWN_MS = 5_000;
// Service poll cadence (src-tauri/src/commands.rs); bounds how late a deadline may be honoured.
export const STATUS_POLL_MS = 2_300;

export interface AutoPending {
  candidateId: string;
  // when the countdown expires and the candidate becomes active
  countdownEndsAt: number;
}

export type AutoMode = {
  mode: "auto";
  pending: AutoPending | null;
};

// The user's own pick: it holds until they pick again or choose Auto.
export type SelectedMode = {
  mode: "selected";
};

export type LiveMode = {
  mode: "live";
  // auto was on for this tunnel, so leaving it hands back to auto
  auto: boolean;
};
export type Mode = AutoMode | SelectedMode | LiveMode;

export interface DestinationMode {
  active: string | null;
  mode: Mode;
  // Suspends auto; in the store rather than the view so tests can reach it.
  listOpen: boolean;
  // From DestinationModeSettings, fixed at creation, then consumed during status updates
  preferredLocation: string | null;
  lastConnectedDestination: string | null;
}

/** The slice of AppState a status update carries. */
export interface ModeAppState {
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  connection: Connection;
  probe: ProbeView | null;
}

export interface DestinationModeSettings {
  preferredLocation: string | null;
  lastConnectedDestination: string | null;
}

export type UserInputEvent =
  | { type: "listOpened" }
  // picked === null is a cancel; an id is the destination chosen from the list
  | { type: "listClosed"; picked: string | null }
  // the list's Auto row: drop the manual pick; the last status lets auto's pick land at once
  | { type: "autoResumed"; status: ModeAppState | null }
  | { type: "connectIssued"; id: string };

export interface DestinationModeHandle {
  model: SolidStore<DestinationMode>;
  // Called once per new backend status — see appStore.ts's processStatusResponse.
  applyStatusUpdate: (status: ModeAppState) => void;
  // Called once per user action (pick from list, connect, ...).
  applyUserInput: (event: UserInputEvent) => void;
  // Clears pending timers and reinitializes the model in place — e.g. after a critical error.
  reset: (settings: DestinationModeSettings) => void;
}

function initialModel(settings: DestinationModeSettings): DestinationMode {
  return {
    active: null,
    mode: { mode: "auto", pending: null },
    listOpen: false,
    preferredLocation: settings.preferredLocation,
    lastConnectedDestination: settings.lastConnectedDestination,
  };
}

function liveIdOf(status: ModeAppState): string | null {
  return connectionDestination(status.connection);
}

/** The only way a destination becomes active, so the preferred shot can never be missed. */
function makeActive(draft: DestinationMode, id: string): void {
  draft.active = id;
  if (draft.preferredLocation === id) draft.preferredLocation = null;
}

const SELECTED: SelectedMode = { mode: "selected" };
const AUTO_IDLE: AutoMode = { mode: "auto", pending: null };

/** A tunnel coming up keeps whether auto was on, so leaving it can resume that. */
function liveFrom(mode: Mode): LiveMode {
  return {
    mode: "live",
    auto: mode.mode === "live" ? mode.auto : mode.mode === "auto",
  };
}

/** Deadlines are truth: a pending past its deadline has already switched, so dropping it must commit it. */
function commitDuePending(draft: DestinationMode): void {
  if (draft.mode.mode !== "auto" || draft.mode.pending === null) return;
  const { candidateId, countdownEndsAt } = draft.mode.pending;
  const now = Date.now();
  if (now < countdownEndsAt) return;
  const sleptThrough = now - countdownEndsAt > STATUS_POLL_MS;
  if (!sleptThrough) makeActive(draft, candidateId);
  draft.mode = AUTO_IDLE;
}

/** Auto's pick: preferred outranks the sort head while unspent and ready — it is an input, not a transition. */
export function autoCandidate(
  status: ModeAppState,
  preferredLocation: string | null,
): string | null {
  const context = rankContext(status);
  if (
    preferredLocation !== null &&
    isReady(status.destinations[preferredLocation], context)
  ) {
    return preferredLocation;
  }
  return sortByRouteQuality(status.destinations, context)[0] ?? null;
}

export function createDestinationMode(
  settings: DestinationModeSettings,
): DestinationModeHandle {
  const [model, setModel] = createStore<DestinationMode>(
    initialModel(settings),
  );

  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  // A working copy every transition mutates; `mode` is replaced, never edited in place.
  function draftOf(): DestinationMode {
    return { ...model };
  }

  function commit(draft: DestinationMode): void {
    setModel(draft);
    syncTimers();
  }

  // Timers are derived from the deadlines rather than set alongside them, so no path can forget one.
  function syncTimers(): void {
    clearTimeout(pendingTimer);
    pendingTimer = undefined;

    const mode = model.mode;
    if (mode.mode === "auto" && mode.pending !== null) {
      const delay = Math.max(0, mode.pending.countdownEndsAt - Date.now());
      pendingTimer = setTimeout(onSwitchDeadline, delay);
    }
  }

  function onSwitchDeadline(): void {
    const draft = draftOf();
    if (draft.mode.mode !== "auto" || draft.mode.pending === null) return;
    // an early wake-up is not the deadline, so re-arm instead of letting it pass silently
    if (Date.now() < draft.mode.pending.countdownEndsAt) {
      syncTimers();
      return;
    }
    // the same clock rules as every other path: a slept-through pending is discarded, not committed
    commitDuePending(draft);
    commit(draft);
  }

  /** No countdown: there is nothing to switch away from until something is active. */
  function coldStart(
    draft: DestinationMode,
    status: ModeAppState,
    candidate: string | null,
  ): void {
    const last = draft.lastConnectedDestination;
    // consulted once per app launch, whether or not it can be used
    draft.lastConnectedDestination = null;
    const offered = last !== null &&
      status.availableDestinations.some((d) => d.id === last);
    const promoted = offered ? last : candidate;
    if (promoted === null) return;
    makeActive(draft, promoted);
    // where we left off is the user's last choice, so auto may not switch it away
    if (offered) draft.mode = SELECTED;
  }

  function applyAuto(draft: DestinationMode, status: ModeAppState): void {
    // the clock decides the commit, not the timer that may never have run
    commitDuePending(draft);
    const pending = draft.mode.mode === "auto" ? draft.mode.pending : null;
    draft.mode = { mode: "auto", pending };

    const candidate = autoCandidate(status, draft.preferredLocation);

    if (draft.active === null) {
      // a countdown switches away from something; cold start has nothing to switch away from
      draft.mode = AUTO_IDLE;
      coldStart(draft, status, candidate);
      return;
    }
    const worthSwitchingTo = candidate !== null &&
      candidate !== draft.active &&
      isReady(status.destinations[candidate], rankContext(status));
    if (!worthSwitchingTo) {
      draft.mode = AUTO_IDLE;
      return;
    }
    if (pending === null) {
      draft.mode = {
        mode: "auto",
        pending: {
          candidateId: candidate,
          countdownEndsAt: Date.now() + SWITCH_COUNTDOWN_MS,
        },
      };
      return;
    }
    if (pending.candidateId === candidate) return;
    // a retarget keeps the deadline, or a flapping best destination would never commit
    draft.mode = {
      mode: "auto",
      pending: { ...pending, candidateId: candidate },
    };
  }

  function applyStatusUpdate(status: ModeAppState): void {
    const draft = draftOf();
    const offered = new Set(status.availableDestinations.map((d) => d.id));

    if (draft.active !== null && !offered.has(draft.active)) {
      draft.active = null;
    }

    const liveId = liveIdOf(status);
    if (liveId !== null) {
      const enteringLive = draft.mode.mode !== "live";
      makeActive(draft, liveId);
      draft.mode = liveFrom(draft.mode);
      // only a connection that surprises us closes the list; one opened over live stays
      if (enteringLive) draft.listOpen = false;
      commit(draft);
      return;
    }

    if (draft.mode.mode === "live") {
      draft.mode = draft.active === null || draft.mode.auto
        ? AUTO_IDLE
        : SELECTED;
      commit(draft);
      return;
    }

    // a mode whose subject the prune removed cannot survive it
    if (draft.active === null && draft.mode.mode === "selected") {
      draft.mode = AUTO_IDLE;
    }
    if (
      draft.mode.mode === "auto" && draft.mode.pending !== null &&
      !offered.has(draft.mode.pending.candidateId)
    ) {
      draft.mode = AUTO_IDLE;
    }

    if (draft.listOpen) {
      if (draft.active !== null) {
        commit(draft);
        return;
      }
      // nothing left to suspend over
      draft.listOpen = false;
    }

    // only auto switches; a selection holds
    if (draft.mode.mode === "selected") {
      commit(draft);
      return;
    }

    applyAuto(draft, status);
    commit(draft);
  }

  function applyUserInput(event: UserInputEvent): void {
    const draft = draftOf();
    switch (event.type) {
      case "listOpened":
        draft.listOpen = true;
        commitDuePending(draft);
        if (draft.mode.mode === "auto") draft.mode = AUTO_IDLE;
        break;
      case "listClosed":
        draft.listOpen = false;
        if (event.picked !== null) {
          makeActive(draft, event.picked);
          // a connect issued on the way out stays live, now as the user's pick
          draft.mode = draft.mode.mode === "live"
            ? { mode: "live", auto: false }
            : SELECTED;
        }
        break;
      case "autoResumed": {
        draft.listOpen = false;
        // a live tunnel is never switched; it only resumes auto once it ends
        if (draft.mode.mode === "live") {
          draft.mode = { mode: "live", auto: true };
          break;
        }
        draft.mode = AUTO_IDLE;
        // the user asked for auto's pick, so it needs no countdown
        const status = event.status;
        const candidate = status &&
          autoCandidate(status, draft.preferredLocation);
        if (
          candidate &&
          isReady(status.destinations[candidate], rankContext(status))
        ) {
          makeActive(draft, candidate);
        }
        break;
      }
      case "connectIssued":
        // we are ahead of the service; the next status response is expected to confirm
        draft.mode = liveFrom(draft.mode);
        makeActive(draft, event.id);
        break;
    }
    commit(draft);
  }

  function reset(newSettings: DestinationModeSettings): void {
    setModel(initialModel(newSettings));
    syncTimers();
  }

  return {
    model,
    applyStatusUpdate,
    applyUserInput,
    reset,
  };
}

/** The one reader of what we are on: past the deadline the candidate has won, unless it is stale enough that the next status update will discard it. */
export function effectiveActive(
  model: DestinationMode,
  now: number,
): string | null {
  if (model.mode.mode !== "auto" || model.mode.pending === null) {
    return model.active;
  }
  const { candidateId, countdownEndsAt } = model.mode.pending;
  if (now < countdownEndsAt || now - countdownEndsAt > STATUS_POLL_MS) {
    return model.active;
  }
  return candidateId;
}

/** Which label the card wears — "Current Best Location" is auto's own word, so a selection never wears it. */
export function cardPhase(model: DestinationMode): CardPhase {
  if (model.mode.mode === "live") return "connecting";
  // a candidate means the active destination is no longer provably best
  return model.mode.mode === "auto" && model.mode.pending === null
    ? "auto"
    : "selected";
}
