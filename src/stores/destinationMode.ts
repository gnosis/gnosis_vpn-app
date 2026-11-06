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
// Flat, unconditional deadline for a selected destination to fall back to auto.
export const SELECTED_AUTO_REVERT_MS = 10_000;
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

export type SelectedMode = {
  mode: "selected";
  // null while suspended — an open list stops the clock
  autoRevertAt: number | null;
};

export type LiveMode = {
  mode: "live";
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
  // a connect is coming as soon as anything is ready, so auto must stay out of its way
  connectOnStartup: boolean;
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
  connectOnStartup: boolean;
}

export type UserInputEvent =
  | { type: "listOpened" }
  // picked === null is a cancel; an id is the destination chosen from the list
  | { type: "listClosed"; picked: string | null }
  // the list's Auto row: drop the manual pick and let auto choose again
  | { type: "autoResumed" }
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
    connectOnStartup: settings.connectOnStartup,
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

function selectedMode(): SelectedMode {
  return {
    mode: "selected",
    autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
  };
}

const AUTO_IDLE: AutoMode = { mode: "auto", pending: null };

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
  let revertTimer: ReturnType<typeof setTimeout> | undefined;

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
    clearTimeout(revertTimer);
    pendingTimer = undefined;
    revertTimer = undefined;

    const mode = model.mode;
    if (mode.mode === "auto" && mode.pending !== null) {
      const delay = Math.max(0, mode.pending.countdownEndsAt - Date.now());
      pendingTimer = setTimeout(onSwitchDeadline, delay);
      return;
    }
    if (mode.mode === "selected" && mode.autoRevertAt !== null) {
      const delay = Math.max(0, mode.autoRevertAt - Date.now());
      revertTimer = setTimeout(onRevertDeadline, delay);
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

  function onRevertDeadline(): void {
    const draft = draftOf();
    if (draft.mode.mode !== "selected" || draft.mode.autoRevertAt === null) {
      return;
    }
    if (Date.now() < draft.mode.autoRevertAt) {
      syncTimers();
      return;
    }
    draft.mode = AUTO_IDLE;
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
    // where we left off is the user's choice, and a coming connect must not race auto's arming
    if (offered || draft.connectOnStartup) draft.mode = selectedMode();
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
      draft.mode = { mode: "live" };
      // only a connection that surprises us closes the list; one opened over live stays
      if (enteringLive) draft.listOpen = false;
      commit(draft);
      return;
    }

    if (draft.mode.mode === "live") {
      draft.mode = draft.active === null ? AUTO_IDLE : selectedMode();
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

    if (draft.mode.mode === "selected") {
      const { autoRevertAt } = draft.mode;
      if (autoRevertAt === null || Date.now() < autoRevertAt) {
        commit(draft);
        return;
      }
      draft.mode = AUTO_IDLE;
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
        if (draft.mode.mode === "selected") {
          draft.mode = { mode: "selected", autoRevertAt: null };
        }
        break;
      case "listClosed":
        draft.listOpen = false;
        if (event.picked !== null) {
          makeActive(draft, event.picked);
          // a connect issued on the way out outranks the list
          if (draft.mode.mode !== "live") draft.mode = selectedMode();
        } else if (draft.mode.mode === "selected") {
          draft.mode = selectedMode();
        }
        break;
      case "autoResumed":
        draft.listOpen = false;
        // a live tunnel is the user's; auto only chooses while disconnected
        if (draft.mode.mode === "selected") draft.mode = AUTO_IDLE;
        break;
      case "connectIssued":
        // we are ahead of the service; the next status response is expected to confirm
        makeActive(draft, event.id);
        draft.mode = { mode: "live" };
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
