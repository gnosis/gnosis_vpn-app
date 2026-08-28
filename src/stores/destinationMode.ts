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

export type Mode =
  | {
      mode: "auto";
      pending: AutoPending | null;
    }
  | {
      mode: "selected";
      autoRevertAt: number;
    }
  | {
      mode: "live";
    };

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

  function applyStatusUpdateAuto(status: ModeAppState): void {
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
    let newMode = model.mode;
    if (newMode.mode === "auto" && newMode.pending)
      if (!availableIds.has(newMode.pending.candidateId)) {
        clearPendingTimer();
        newMode = { mode: "auto", pending: null };
      }

    // no best destination
    if (bestDestination === undefined) {
      clearPendingTimer();
      newMode = { mode: "auto", pending: null };
      // best destination already active
    } else if (newActive === bestDestination) {
      clearPendingTimer();
      newMode = { mode: "auto", pending: null };
      // no candidate pending, start countdown to switch
    } else if (newMode.pending === null) {
      const countdownEndsAt = Date.now() + SWITCH_COUNTDOWN_MS;
      const settleAt = countdownEndsAt + SWITCH_CROSSOVER_MS;
      newMode = {
        mode: "auto",
        pending: { candidateId: bestDestination, countdownEndsAt, settleAt },
      };
      armPendingCandidate();
      // candidate pending, but different from best destination, restart countdown
    } else if (newMode.pending.candidateId !== bestDestination) {
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
    });
  }

  function applyStatusUpdateSelected(_status: ModeAppState): void {
    // watch active entry's readiness; revert to auto if it drops
    throw new Error("not implemented");
  }

  function applyStatusUpdateLive(_status: ModeAppState): void {
    // derive active/entries from connected/connecting/reconnecting
    throw new Error("not implemented");
  }

  function applyStatusUpdate(status: ModeAppState): void {
    // let newMode = // determine mode from status, if connecting/reconnecintg/connected -> live
    // if not live, stay in user/auto mode as is
    // if not live and model.mode was live, switch to auto mode
    // switch (newMode)
    switch (model.mode) {
      case "auto":
        applyStatusUpdateAuto(status);
        return;
      case "selected":
        applyStatusUpdateSelected(status);
        return;
      case "live":
        applyStatusUpdateLive(status);
        return;
    }
  }

  return {
    model,
    applyStatusUpdate,
    applyUserInput,
  };
}
