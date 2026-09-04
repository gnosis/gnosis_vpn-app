// Spec: docs/destinationMode.md — on disagreement the spec is right and this file has a bug.
import { createStore, type Store as SolidStore } from "solid-js/store";

import type {
  ConnectedInfo,
  ConnectingInfo,
  Destination,
  DestinationState,
  ReconnectingInfo,
} from "@src/services/vpnService.ts";
import {
  type CardPhase,
  isReady,
  sortByCapacityAwareLatency,
} from "@src/utils/destinations.ts";

// Countdown timeout before starting switch animation
export const SWITCH_COUNTDOWN_MS = 5_000;
// Switch animation will take 333ms shrink/growth and 666ms slide left
// so after half of the slide animation the new one is considered active
export const SWITCH_CROSSOVER_MS = 666;
// Total duration of the (UI-owned) slide animation once a switch starts.
export const SWITCH_ANIMATE_MS = 1_000;
// Flat, unconditional deadline for a selected destination to fall back to auto.
export const SELECTED_AUTO_REVERT_MS = 10_000;
// Service poll cadence (src-tauri/src/commands.rs); bounds how late a deadline may be honoured.
export const STATUS_POLL_MS = 2_300;

export interface Entry {
  // Render/reconcile identity, distinct from `id` — lets a re-pick mount fresh.
  key: number;
  // The sweep's justification for an entry: history stays, a bare candidate does not.
  wasActive: boolean;
}

// Flat, view-friendly shape — hides the entries-Record + sequence-array split below.
export interface DestinationEntry extends Entry {
  id: string;
}

export interface AutoPending {
  candidateId: string;
  // when the countdown expires
  countdownEndsAt: number;
  // countdownEndsAt + SWITCH_CROSSOVER_MS
  settleAt: number;
}

export type AutoMode = {
  mode: "auto";
  pending: AutoPending | null;
};

export type SelectedMode = {
  mode: "selected";
  // null while suspended — an open list or a finger on the strip stops the clock
  autoRevertAt: number | null;
};

export type LiveMode = {
  mode: "live";
};
export type Mode = AutoMode | SelectedMode | LiveMode;

export interface DestinationMode {
  entries: Record<string, Entry>;
  sequence: string[];
  active: string | null;
  mode: Mode;
  // Monotonic, never reused — avoids a re-added id colliding with a stale render key.
  nextKey: number;
  // Both suspend auto; in the store rather than the view so tests can reach them.
  listOpen: boolean;
  dragging: boolean;
  // From DestinationModeSettings, fixed at creation, then consumed during status updates
  preferredLocation: string | null;
  lastConnectedDestination: string | null;
}

/** The slice of AppState a status update carries. */
export interface ModeAppState {
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  connected: ConnectedInfo | null;
  connecting: ConnectingInfo | null;
  reconnecting: ReconnectingInfo | null;
}

export interface DestinationModeSettings {
  preferredLocation: string | null;
  lastConnectedDestination: string | null;
}

export type UserInputEvent =
  | { type: "listOpened" }
  // picked === null is a cancel; an id is the destination chosen from the list
  | { type: "listClosed"; picked: string | null }
  | { type: "dragStarted" }
  | { type: "slideCommitted"; id: string }
  | { type: "connectIssued"; id: string };

export interface DestinationModeHandle {
  model: SolidStore<DestinationMode>;
  // Called once per new backend status — see appStore.ts's processStatusResponse.
  applyStatusUpdate: (status: ModeAppState) => void;
  // Called once per user action (pick from list, scroll/settle on a card, ...).
  applyUserInput: (event: UserInputEvent) => void;
  // Clears pending timers and reinitializes the model in place — e.g. after a critical error.
  reset: (settings: DestinationModeSettings) => void;
}

function initialModel(settings: DestinationModeSettings): DestinationMode {
  return {
    entries: {},
    sequence: [],
    active: null,
    mode: { mode: "auto", pending: null },
    nextKey: 0,
    listOpen: false,
    dragging: false,
    preferredLocation: settings.preferredLocation,
    lastConnectedDestination: settings.lastConnectedDestination,
  };
}

function liveIdOf(status: ModeAppState): string | null {
  return status.connected?.destination_id ??
    status.connecting?.destination_id ??
    status.reconnecting?.destination_id ??
    null;
}

/** Mints the entry if it is new; appends so history reads oldest to newest. */
function ensureEntry(draft: DestinationMode, id: string): void {
  if (id in draft.entries) return;
  draft.entries[id] = { key: draft.nextKey++, wasActive: false };
  draft.sequence.push(id);
}

/** The only way an entry becomes active, so `wasActive` and the preferred shot can never be missed. */
function makeActive(draft: DestinationMode, id: string): void {
  ensureEntry(draft, id);
  draft.entries[id] = { ...draft.entries[id], wasActive: true };
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

/** Every entry is either history, the current candidate, or drag-held — anything else is dropped. */
function sweep(draft: DestinationMode): void {
  const candidateId = draft.mode.mode === "auto"
    ? draft.mode.pending?.candidateId ?? null
    : null;
  for (const [id, entry] of Object.entries(draft.entries)) {
    // dragging holds every card in place; whatever ends the drag collects the orphan
    if (draft.dragging || entry.wasActive || id === candidateId) continue;
    delete draft.entries[id];
  }
  draft.sequence = draft.sequence.filter((id) => id in draft.entries);
}

/** Deadlines are truth: a pending past settleAt has already switched, so dropping it must commit it. */
function commitDuePending(draft: DestinationMode): void {
  if (draft.mode.mode !== "auto" || draft.mode.pending === null) return;
  const { candidateId, settleAt } = draft.mode.pending;
  const now = Date.now();
  if (now < settleAt) return;
  const sleptThrough = now - settleAt > STATUS_POLL_MS;
  if (!sleptThrough) makeActive(draft, candidateId);
  draft.mode = AUTO_IDLE;
}

export function createDestinationMode(
  settings: DestinationModeSettings,
): DestinationModeHandle {
  const [model, setModel] = createStore<DestinationMode>(
    initialModel(settings),
  );

  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let revertTimer: ReturnType<typeof setTimeout> | undefined;

  // A working copy every transition mutates; `mode` and each Entry are replaced, never edited in place.
  function draftOf(): DestinationMode {
    return {
      ...model,
      entries: { ...model.entries },
      sequence: [...model.sequence],
    };
  }

  function commit(draft: DestinationMode): void {
    sweep(draft);
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
      const delay = Math.max(0, mode.pending.settleAt - Date.now());
      pendingTimer = setTimeout(onSettleDeadline, delay);
      return;
    }
    if (mode.mode === "selected" && mode.autoRevertAt !== null) {
      const delay = Math.max(0, mode.autoRevertAt - Date.now());
      revertTimer = setTimeout(onRevertDeadline, delay);
    }
  }

  function onSettleDeadline(): void {
    const draft = draftOf();
    if (draft.mode.mode !== "auto" || draft.mode.pending === null) return;
    if (Date.now() < draft.mode.pending.settleAt) {
      syncTimers();
      return;
    }
    makeActive(draft, draft.mode.pending.candidateId);
    draft.mode = AUTO_IDLE;
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

  /** Preferred outranks the sort head while unspent and ready — it is an input, not a transition. */
  function effectiveCandidate(status: ModeAppState, draft: DestinationMode) {
    const preferred = draft.preferredLocation;
    if (preferred !== null && isReady(status.destinations[preferred], null)) {
      return preferred;
    }
    return sortByCapacityAwareLatency(status.destinations)[0] ?? null;
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
  }

  function applyAuto(draft: DestinationMode, status: ModeAppState): void {
    const now = Date.now();
    // the clock decides the commit, not the timer that may never have run
    commitDuePending(draft);
    const pending = draft.mode.mode === "auto" ? draft.mode.pending : null;
    draft.mode = { mode: "auto", pending };

    const candidate = effectiveCandidate(status, draft);

    if (draft.active === null) {
      // a countdown switches away from something; cold start has nothing to switch away from
      draft.mode = AUTO_IDLE;
      coldStart(draft, status, candidate);
      return;
    }
    const worthSwitchingTo = candidate !== null &&
      candidate !== draft.active &&
      isReady(status.destinations[candidate], null);
    if (!worthSwitchingTo) {
      draft.mode = AUTO_IDLE;
      return;
    }
    if (pending === null) {
      ensureEntry(draft, candidate);
      const countdownEndsAt = now + SWITCH_COUNTDOWN_MS;
      draft.mode = {
        mode: "auto",
        pending: {
          candidateId: candidate,
          countdownEndsAt,
          settleAt: countdownEndsAt + SWITCH_CROSSOVER_MS,
        },
      };
      return;
    }
    if (pending.candidateId === candidate) return;
    // inside the crossover the view is already sliding somewhere specific
    if (now >= pending.countdownEndsAt) return;
    ensureEntry(draft, candidate);
    draft.mode = {
      mode: "auto",
      pending: { ...pending, candidateId: candidate },
    };
  }

  function applyStatusUpdate(status: ModeAppState): void {
    const draft = draftOf();
    const availableIds = new Set(status.availableDestinations.map((d) => d.id));

    for (const id of Object.keys(draft.entries)) {
      if (availableIds.has(id)) continue;
      delete draft.entries[id];
    }
    draft.sequence = draft.sequence.filter((id) => id in draft.entries);
    if (draft.active !== null && !(draft.active in draft.entries)) {
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
      !(draft.mode.pending.candidateId in draft.entries)
    ) {
      draft.mode = AUTO_IDLE;
    }

    if (draft.listOpen || draft.dragging) {
      if (draft.active !== null) {
        commit(draft);
        return;
      }
      // nothing left to suspend over
      draft.listOpen = false;
      draft.dragging = false;
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

  /** The pick takes the outgoing card's slot, so the strip keeps its order and never repeats an id. */
  function pickDestination(draft: DestinationMode, id: string): void {
    const outgoing = draft.active;
    if (outgoing !== null && outgoing !== id) {
      delete draft.entries[outgoing];
      draft.sequence = draft.sequence
        .filter((entryId) => entryId !== id)
        .map((entryId) => (entryId === outgoing ? id : entryId));
      // a fresh key mounts the card instead of sliding the old one into place
      draft.entries[id] = { key: draft.nextKey++, wasActive: true };
      draft.active = id;
      if (draft.preferredLocation === id) draft.preferredLocation = null;
    } else {
      makeActive(draft, id);
    }
    // a connect issued on the way out outranks the list
    if (draft.mode.mode !== "live") draft.mode = selectedMode();
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
          pickDestination(draft, event.picked);
        } else if (draft.mode.mode === "selected") {
          draft.mode = selectedMode();
        }
        break;
      case "dragStarted":
        draft.dragging = true;
        commitDuePending(draft);
        if (draft.mode.mode === "auto") draft.mode = AUTO_IDLE;
        // touching the strip is a selection from the first movement, with the clock stopped
        if (draft.active !== null) {
          draft.mode = { mode: "selected", autoRevertAt: null };
        }
        break;
      case "slideCommitted":
        draft.dragging = false;
        if (!(event.id in draft.entries)) {
          // the card went away mid-drag; resume rather than point at nothing
          if (draft.mode.mode === "selected") draft.mode = selectedMode();
          break;
        }
        makeActive(draft, event.id);
        draft.mode = selectedMode();
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

/** `entries`/`sequence` as a flat, ordered list — the shape the view wants. */
export function orderedEntries(model: DestinationMode): DestinationEntry[] {
  return model.sequence.map((id) => ({ id, ...model.entries[id] }));
}

/** The one reader of what we are on: past settleAt the candidate has won, unless it is stale enough that the next status update will discard it. */
export function effectiveActive(
  model: DestinationMode,
  now: number,
): string | null {
  if (model.mode.mode !== "auto" || model.mode.pending === null) {
    return model.active;
  }
  const { candidateId, settleAt } = model.mode.pending;
  if (now < settleAt || now - settleAt > STATUS_POLL_MS) return model.active;
  return candidateId;
}

/** Which label a card wears — "Best Location" is auto's own word, so a selection never wears it. */
export function cardPhaseFor(model: DestinationMode, id: string): CardPhase {
  const pending = model.mode.mode === "auto" ? model.mode.pending : null;
  // a candidate previews auto's label while it is still only peeking
  if (id !== model.active) {
    return pending?.candidateId === id ? "auto" : "selected";
  }
  if (model.mode.mode === "live") return "connecting";
  // a candidate means even the active card is no longer provably best
  return model.mode.mode === "auto" && pending === null ? "auto" : "selected";
}
