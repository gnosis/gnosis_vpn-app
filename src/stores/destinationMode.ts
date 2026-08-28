import { createStore, type Store as SolidStore } from "solid-js/store";

import type {
  ConnectedInfo,
  ConnectingInfo,
  Destination,
  DestinationState,
  ReconnectingInfo,
} from "@src/services/vpnService.ts";
import { sortByCapacityAwareLatency } from "@src/utils/destinations.ts";

export type Origin = "auto" | "user";

// Countdown timeout before starting switch animation
export const SWITCH_COUNTDOWN_MS = 5_000;
// Switch animation will take 333ms shrink/growth and 666ms slide left
// so after half of the slide animation the new one is considered active
export const SWITCH_CROSSOVER_MS = 666;

export interface Entry {
  origin: Origin;
  // Render/reconcile identity — see backupDestinationMode's DestinationEntry.key.
  key: number;
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
    setActive(model.mode.pending.candidateId);
    setModel("mode", { mode: "auto", pending: null });
  }

  function armPendingCandidate(): void {
    clearPendingTimer();
    pendingTimer = setTimeout(
      commitPendingCandidate,
      SWITCH_COUNTDOWN_MS + SWITCH_CROSSOVER_MS,
    );
  }

  function setActive(id: string): void {
    if (id in model.entries) {
      setModel("active", id);
    }
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
    let newActive =
      model.active && availableIds.has(model.active) ? model.active : null;
    if (!newActive) {
      newActive = bestDestination ?? null;
    }

    // ensure pending candidate is still available, if not cancel
    let newMode = mode;
    if (newMode.mode === "auto" && newMode.pending)
      if (!availableIds.has(newMode.pending.candidateId)) {
        clearPendingTimer();
        newMode = { mode: "auto", pending: null };
      }

    let newPreferredLocation = model.preferredLocation;
    let newLastConnectedDestination = model.lastConnectedDestination;

    // no best destination
    if (bestDestination === undefined) {
      clearPendingTimer();
      newMode = { mode: "auto", pending: null };
    } else
      // best destination already active
      if (newActive === bestDestination) {
        clearPendingTimer();
        newMode = { mode: "auto", pending: null };
      } else
        // fresh or some weird data came in which we treat as fresh
        if (!newActive && newPreferredLocation) {
          // CL: find preferredLocation in availableDestinations with readyToConnect state and set newActive
          newPreferredLocation = null;
        } else if (!newActive && newLastConnectedDestination) {
          // CL: find newLastConnectedDestination in availableDestinations with readyToConnect state and set newActive
          newLastConnectedDestination = null;
        } else
          // best destination will become pending
          if (newMode.pending === null) {
            const countdownEndsAt = Date.now() + SWITCH_COUNTDOWN_MS;
            const settleAt = countdownEndsAt + SWITCH_CROSSOVER_MS;
            newMode = {
              mode: "auto",
              pending: {
                candidateId: bestDestination,
                countdownEndsAt,
                settleAt,
              },
            };
            armPendingCandidate();
          } else
            // update pending with actual best destination
            if (newMode.pending.candidateId !== bestDestination) {
              newMode = {
                mode: "auto",
                pending: {
                  candidateId: bestDestination,
                  countdownEndsAt: newMode.pending.countdownEndsAt,
                  settleAt: newMode.pending.settleAt,
                },
              };
            }

    setModel({
      entries: newEntries,
      sequence: newSequence,
      active: newActive,
      mode: newMode,
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
