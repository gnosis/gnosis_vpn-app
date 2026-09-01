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

export interface Entry {
  origin: Origin;
  // Render/reconcile identity — see backupDestinationMode's DestinationEntry.key.
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

/** The slice of AppState a status update carries; defined locally, not imported from backupDestinationMode.ts. */
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
}

function isDestinationReadyToConnect(destState?: DestinationState): boolean {
  return isReadyToConnect(destState?.route_health ?? undefined);
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
      // preferred gets one shot ever; any path to active spends it
      if (id === model.preferredLocation) {
        setModel("preferredLocation", null);
      }
    });
  }

  function applyUserInput(event: UserInputEvent): void {
    switch (event.type) {
      case "pickDestination":
      case "setActiveEntry":
        setActive(event.id);
        return;
    }
  }

  function applyStatusUpdateAuto(status: ModeAppState, mode: AutoMode): void {
    const bestDestination = sortByCapacityAwareLatency(status.destinations)[0];
    // ensure baseline data is still available, if not adjust
    const availableIds = new Set(status.availableDestinations.map((d) => d.id));
    const newEntries = Object.fromEntries(
      Object.entries(model.entries).filter(([id]) => availableIds.has(id)),
    );
    const newSequence = model.sequence.filter((id) => availableIds.has(id));
    let newActive = model.active && availableIds.has(model.active)
      ? model.active
      : null;

    // ensure pending candidate is still available, if not cancel
    let newMode = mode;
    if (newMode.pending && !availableIds.has(newMode.pending.candidateId)) {
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

    // removes a candidate's transient entry/sequence slot (a pending candidate that never committed)
    const removeEntry = (id: string) => {
      delete newEntries[id];
      const index = newSequence.indexOf(id);
      if (index !== -1) newSequence.splice(index, 1);
    };

    // moves the pending slot to candidateId, dropping the old one's entry; leaves timing alone
    const swapPendingEntry = (candidateId: string) => {
      const staleId = newMode.pending?.candidateId ?? null;
      if (staleId !== null && staleId !== candidateId) {
        removeEntry(staleId);
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
        removeEntry(staleId);
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

      // fresh or some weird data came in which we treat as fresh
      if (!newActive) {
        const preferred = routablePreferredLocation();
        if (preferred) {
          newActive = preferred;
          newPreferredLocation = null;
          skipArmThisTick = true;
        } else if (newLastConnectedDestination) {
          if (
            isDestinationReadyToConnect(
              status.destinations[newLastConnectedDestination],
            )
          ) {
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
    _status: ModeAppState,
    mode: SelectedMode,
  ): void {
    // watch active entry's readiness; revert to auto if it drops
    throw new Error("not implemented");
  }

  function applyStatusUpdateLive(_status: ModeAppState, mode: LiveMode): void {
    // derive active/entries from connected/connecting/reconnecting
    throw new Error("not implemented");
  }

  function applyStatusUpdate(status: ModeAppState): void {
    // let newMode = // determine mode from status, if connecting/reconnecintg/connected -> live
    // if not live, stay in user/auto mode as is
    // if not live and model.mode was live, switch to auto mode
    // switch (newMode)
    switch (model.mode.mode) {
      case "auto":
        applyStatusUpdateAuto(status, model.mode);
        return;
      case "selected":
        applyStatusUpdateSelected(status, model.mode);
        return;
      case "live":
        applyStatusUpdateLive(status, model.mode);
        return;
    }
  }

  return {
    model,
    applyStatusUpdate,
    applyUserInput,
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
    model.mode.mode === "auto" && model.mode.pending &&
    now >= model.mode.pending.settleAt
  ) {
    return model.mode.pending.candidateId;
  }
  return model.active;
}
