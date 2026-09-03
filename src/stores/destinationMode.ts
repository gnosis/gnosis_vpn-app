import { batch } from "solid-js";
import { createStore, type Store as SolidStore } from "solid-js/store";

import type {
  ConnectedInfo,
  ConnectingInfo,
  Destination,
  DestinationState,
  ReconnectingInfo,
} from "@src/services/vpnService.ts";
import { sortByCapacityAwareLatency } from "@src/utils/destinations.ts";
import { isReadyToConnect } from "@src/utils/exitHealth.ts";

export type Origin = "auto" | "user";

// Countdown timeout before starting switch animation
export const SWITCH_COUNTDOWN_MS = 5_000;
// Switch animation will take 333ms shrink/growth and 666ms slide left
// so after half of the slide animation the new one is considered active
export const SWITCH_CROSSOVER_MS = 666;
// Total duration of the (UI-owned) slide animation once a switch starts.
export const SWITCH_ANIMATE_MS = 1_000;
// Flat, unconditional deadline for a selected destination to fall back to auto.
export const SELECTED_AUTO_REVERT_MS = 10_000;

export interface Entry {
  origin: Origin;
  // Render/reconcile identity, distinct from `id` — lets a re-pick mount fresh.
  key: number;
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
  autoRevertAt: number;
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
  | { type: "pickDestination"; id: string }
  | { type: "setActiveEntry"; id: string };

export interface DestinationModeHandle {
  model: SolidStore<DestinationMode>;
  // Called once per new backend status — see appStore.ts's processStatusResponse.
  applyStatusUpdate: (status: ModeAppState) => void;
  // Called once per user action (pick from list, scroll/settle on a card, ...).
  applyUserInput: (event: UserInputEvent) => void;
  // Clears pending timers and reinitializes the model in place — e.g. after a critical error.
  reset: (settings: DestinationModeSettings) => void;
}

/** Model slice re-checked against what the backend still offers, plus the id set it was filtered against. */
interface Baseline {
  entries: Record<string, Entry>;
  sequence: string[];
  active: string | null;
  availableIds: Set<string>;
}

function isDestinationReadyToConnect(destState?: DestinationState): boolean {
  return isReadyToConnect(destState?.route_health ?? undefined);
}

/** Drops a destination's entry/sequence slot — e.g. a pending candidate that never committed. */
function removeEntry(
  entries: Record<string, Entry>,
  sequence: string[],
  id: string,
): void {
  delete entries[id];
  const index = sequence.indexOf(id);
  if (index !== -1) sequence.splice(index, 1);
}

function initialModel(settings: DestinationModeSettings): DestinationMode {
  return {
    entries: {},
    sequence: [],
    active: null,
    mode: {
      mode: "auto",
      pending: null,
    },
    nextKey: 0,
    preferredLocation: settings.preferredLocation,
    lastConnectedDestination: settings.lastConnectedDestination,
  };
}

export function createDestinationMode(
  settings: DestinationModeSettings,
): DestinationModeHandle {
  const [model, setModel] = createStore<DestinationMode>(
    initialModel(settings),
  );

  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  const clearPendingTimer = () => {
    clearTimeout(pendingTimer);
    pendingTimer = undefined;
  };

  let revertTimer: ReturnType<typeof setTimeout> | undefined;
  const clearRevertTimer = () => {
    clearTimeout(revertTimer);
    revertTimer = undefined;
  };

  // entries/sequence/active all stay put — only the mode falls back
  function revertToAuto(): void {
    revertTimer = undefined;
    if (model.mode.mode !== "selected") return;
    // a top-level write replaces the mode; setModel("mode", ...) would merge
    setModel({ mode: { mode: "auto", pending: null } });
  }

  // the one place `selected` is constructed, so its deadline can never be forgotten
  function startSelectedMode(): SelectedMode {
    clearPendingTimer();
    clearRevertTimer();
    revertTimer = setTimeout(revertToAuto, SELECTED_AUTO_REVERT_MS);
    return {
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    };
  }

  // entries/sequence/active all come from the caller — only the mode is minted here
  function enterSelected(baseline: Baseline, id: string): void {
    setModel({
      entries: baseline.entries,
      sequence: baseline.sequence,
      active: id,
      mode: startSelectedMode(),
    });
  }

  function commitPendingCandidate(): void {
    if (model.mode.mode !== "auto" || model.mode.pending === null) return;
    const candidateId = model.mode.pending.candidateId;
    // must land together — a reader seeing one change without the other would tear.
    batch(() => {
      setActive(candidateId);
      setModel("mode", { mode: "auto", pending: null });
    });
  }

  function armPendingCandidate(): void {
    clearPendingTimer();
    pendingTimer = setTimeout(
      commitPendingCandidate,
      SWITCH_COUNTDOWN_MS + SWITCH_CROSSOVER_MS,
    );
  }

  function setActive(id: string): void {
    if (!(id in model.entries)) return;
    batch(() => {
      setModel("active", id);
      if (id === model.preferredLocation) {
        setModel("preferredLocation", null);
      }
    });
  }

  // preferred gets one shot ever; any path to active spends it
  const spendPreferred = (id: string) =>
    id === model.preferredLocation ? null : model.preferredLocation;

  // takes the place of the card the user opened the list from, keeping the rest of the strip
  function replaceActiveWithPick(id: string): void {
    // early return on corrupted data or same location selection
    const outgoing = model.active;
    if (outgoing === null || outgoing === id) {
      return;
    }

    const newEntries = { ...model.entries };
    delete newEntries[outgoing];
    // always a fresh key — reconcile() would otherwise reposition the old card instead of mounting one
    newEntries[id] = { origin: "user", key: model.nextKey };

    // the pick takes the outgoing slot; a copy of it elsewhere in the strip goes
    const newSequence = model.sequence
      .filter((entryId) => entryId !== id)
      .map((entryId) => (entryId === outgoing ? id : entryId));

    setModel({
      entries: newEntries,
      sequence: newSequence,
      active: id,
      mode: startSelectedMode(),
      nextKey: model.nextKey + 1,
      preferredLocation: spendPreferred(id),
    });
  }

  function applyUserInput(event: UserInputEvent): void {
    switch (event.type) {
      case "pickDestination":
        replaceActiveWithPick(event.id);
        return;
      // sliding only moves the marker; history stays as it is
      case "setActiveEntry":
        setModel({
          active: event.id,
          mode: startSelectedMode(),
          preferredLocation: spendPreferred(event.id),
        });
        return;
    }
  }

  function sanitizedBaseline(status: ModeAppState): Baseline {
    const availableIds = new Set(status.availableDestinations.map((d) => d.id));
    return {
      entries: Object.fromEntries(
        Object.entries(model.entries).filter(([id]) => availableIds.has(id)),
      ),
      sequence: model.sequence.filter((id) => availableIds.has(id)),
      active: model.active && availableIds.has(model.active)
        ? model.active
        : null,
      availableIds,
    };
  }

  function applyStatusUpdateAuto(
    status: ModeAppState,
    baseline: Baseline,
    mode: AutoMode,
  ): void {
    const bestDestination = sortByCapacityAwareLatency(status.destinations)[0];
    // mutated in place below, then written back in one go
    const newEntries = baseline.entries;
    const newSequence = baseline.sequence;
    let newActive = baseline.active;

    // ensure pending candidate is still available, if not cancel
    let newMode = mode;
    if (
      newMode.pending &&
      !baseline.availableIds.has(newMode.pending.candidateId)
    ) {
      clearPendingTimer();
      newMode = { mode: "auto", pending: null };
    }

    let newPreferredLocation = model.preferredLocation;
    let newLastConnectedDestination = model.lastConnectedDestination;
    let newNextKey = model.nextKey;

    // one lifetime shot for preferred; only counts once routable, not merely configured
    const routablePreferredLocation = (): string | null =>
      newPreferredLocation !== null &&
        isDestinationReadyToConnect(status.destinations[newPreferredLocation])
        ? newPreferredLocation
        : null;

    // moves the pending slot to candidateId, dropping the old one's entry; leaves timing alone
    const swapPendingEntry = (candidateId: string) => {
      const staleId = newMode.pending?.candidateId ?? null;
      if (staleId !== null && staleId !== candidateId) {
        removeEntry(newEntries, newSequence, staleId);
      }
      if (!(candidateId in newEntries)) {
        newEntries[candidateId] = { origin: "auto", key: newNextKey++ };
      }
      const existingIndex = newSequence.indexOf(candidateId);
      if (existingIndex !== -1) newSequence.splice(existingIndex, 1);
      newSequence.push(candidateId);
    };

    // drops the pending candidate's entry when it's abandoned uncommitted, e.g. reverting to active
    const dropPendingEntry = () => {
      const staleId = newMode.pending?.candidateId ?? null;
      if (staleId !== null && staleId !== newActive) {
        removeEntry(newEntries, newSequence, staleId);
      }
    };

    // registers a destination promoted straight to active with no history entry yet
    const addEntry = (id: string) => {
      if (!(id in newEntries)) {
        newEntries[id] = { origin: "auto", key: newNextKey++ };
        newSequence.push(id);
      }
    };

    // arms a fresh countdown for candidateId; used for a new pending and for a preferred hijack
    const armPending = (candidateId: string): AutoMode => {
      swapPendingEntry(candidateId);
      const countdownEndsAt = Date.now() + SWITCH_COUNTDOWN_MS;
      const settleAt = countdownEndsAt + SWITCH_CROSSOVER_MS;
      armPendingCandidate();
      return {
        mode: "auto",
        pending: { candidateId, countdownEndsAt, settleAt },
      };
    };

    // no best destination
    if (bestDestination === undefined) {
      dropPendingEntry();
      clearPendingTimer();
      newMode = { mode: "auto", pending: null };
    } else {
      let skipArmThisTick = false;

      // no active id — cold start, or the caller sent us here because it vanished
      if (!newActive) {
        const preferred = routablePreferredLocation();
        if (preferred) {
          addEntry(preferred);
          newActive = preferred;
          newPreferredLocation = null;
          skipArmThisTick = true;
        } else if (newLastConnectedDestination) {
          if (
            isDestinationReadyToConnect(
              status.destinations[newLastConnectedDestination],
            )
          ) {
            addEntry(newLastConnectedDestination);
            newActive = newLastConnectedDestination;
          }
          newLastConnectedDestination = null;
          skipArmThisTick = true;
        }
      }

      if (!skipArmThisTick) {
        // preferred wins over bestDestination whenever routable and unspent
        const preferred = routablePreferredLocation();
        const effectiveCandidate = preferred ?? bestDestination;

        if (newActive === effectiveCandidate) {
          // best destination already active; drop any stale pending entry left over from before
          dropPendingEntry();
          clearPendingTimer();
          newMode = { mode: "auto", pending: null };
        } else if (newMode.pending === null) {
          // best destination will become pending
          newMode = armPending(effectiveCandidate);
        } else if (newMode.pending.candidateId !== effectiveCandidate) {
          if (preferred) {
            // hijack: preferred always restarts the countdown fresh.
            newMode = armPending(effectiveCandidate);
          } else if (Date.now() < newMode.pending.countdownEndsAt) {
            // update pending with actual best destination
            swapPendingEntry(effectiveCandidate);
            newMode = {
              mode: "auto",
              pending: { ...newMode.pending, candidateId: effectiveCandidate },
            };
          }
        }
      }
    }

    if (newActive !== null && newActive === newPreferredLocation) {
      newPreferredLocation = null;
    }

    setModel({
      entries: newEntries,
      sequence: newSequence,
      active: newActive,
      mode: newMode,
      nextKey: newNextKey,
      preferredLocation: newPreferredLocation,
      lastConnectedDestination: newLastConnectedDestination,
    });
  }

  function applyStatusUpdateSelected(
    status: ModeAppState,
    baseline: Baseline,
    mode: SelectedMode,
  ): void {
    // the deadline, not the timer, is the source of truth — timers get throttled
    if (Date.now() >= mode.autoRevertAt) {
      clearRevertTimer();
      applyStatusUpdateAuto(status, baseline, { mode: "auto", pending: null });
      return;
    }
    setModel({
      entries: baseline.entries,
      sequence: baseline.sequence,
      active: baseline.active,
      mode,
    });
  }

  function applyStatusUpdateLive(baseline: Baseline, liveId: string): void {
    // nothing derived locally outranks a real connection — a countdown least of all
    clearPendingTimer();
    clearRevertTimer();

    // mutated in place below, then written back in one go
    const newEntries = baseline.entries;
    const newSequence = baseline.sequence;
    let newNextKey = model.nextKey;

    // a speculative candidate that never committed has no reason to linger
    const pendingId = model.mode.mode === "auto"
      ? (model.mode.pending?.candidateId ?? null)
      : null;
    if (pendingId !== null && pendingId !== liveId) {
      removeEntry(newEntries, newSequence, pendingId);
    }

    // what we're connected to stays in entries even once no longer offered
    if (!(liveId in newEntries)) {
      newEntries[liveId] = { origin: "auto", key: newNextKey++ };
      newSequence.push(liveId);
    }

    setModel({
      entries: newEntries,
      sequence: newSequence,
      active: liveId,
      mode: { mode: "live" },
      nextKey: newNextKey,
      // preferred gets one shot ever; any path to active spends it
      preferredLocation: liveId === model.preferredLocation
        ? null
        : model.preferredLocation,
      // only ever consulted while active is null, which it no longer is
      lastConnectedDestination: null,
    });
  }

  function applyStatusUpdate(status: ModeAppState): void {
    const baseline = sanitizedBaseline(status);
    const mode = model.mode;

    // the backend's own connection state outranks any locally derived mode
    const liveId = status.connected?.destination_id ??
      status.connecting?.destination_id ??
      status.reconnecting?.destination_id ??
      null;
    if (liveId !== null) {
      applyStatusUpdateLive(baseline, liveId);
      return;
    }

    // leaving live parks on the last live id; teardown is UI feedback only
    if (mode.mode === "live" && baseline.active !== null) {
      enterSelected(baseline, baseline.active);
      return;
    }

    // only the flat deadline or a vanished destination ends a selection, never readiness
    if (mode.mode === "selected" && baseline.active !== null) {
      applyStatusUpdateSelected(status, baseline, mode);
      return;
    }

    // auto absorbs the rest: fresh start or a destination that vanished
    clearRevertTimer();
    const autoMode: AutoMode = mode.mode === "auto"
      ? mode
      : { mode: "auto", pending: null };
    applyStatusUpdateAuto(status, baseline, autoMode);
  }

  function reset(newSettings: DestinationModeSettings): void {
    clearPendingTimer();
    clearRevertTimer();
    setModel(initialModel(newSettings));
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

/** What's currently shown, ignoring an in-flight pending candidate. */
export function currentDisplayId(model: DestinationMode): string | null {
  return model.active;
}

/** What Connect should target now: the outgoing destination before settleAt, the incoming one at/after it. */
export function resolveConnectTarget(
  model: DestinationMode,
  now: number,
): string | null {
  if (
    model.mode.mode === "auto" &&
    model.mode.pending &&
    now >= model.mode.pending.settleAt
  ) {
    return model.mode.pending.candidateId;
  }
  return model.active;
}
