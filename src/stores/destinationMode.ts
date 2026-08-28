import { createStore, type Store as SolidStore } from "solid-js/store";

import type {
  ConnectedInfo,
  ConnectingInfo,
  Destination,
  DestinationState,
  ReconnectingInfo,
} from "@src/services/vpnService.ts";

export type Origin = "auto" | "user";

// Must stay in sync with backupDestinationMode.ts's timing constants until this store replaces it.
export const SWITCH_COUNTDOWN_MS = 5_000;
export const SWITCH_CROSSOVER_MS = 500;

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
  // From DestinationModeSettings, fixed at creation — never touched by applyStatusUpdate.
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
    mode: "auto",
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
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = undefined;
    }
  };

  // Flips `active` off this timer alone; reads candidateId from the model so a late retarget still commits correctly.
  function commitPendingCandidate(): void {
    pendingTimer = undefined;
    if (model.mode.mode !== "auto" || model.mode.pending === null) return;
    setModel("active", model.mode.pending.candidateId);
    setModel("mode", "pending", null);
  }

  // Starts the countdown and schedules this store's own commit — not wired to a caller yet.
  function armPendingCandidate(candidateId: string): void {
    clearPendingTimer();
    const countdownEndsAt = Date.now() + SWITCH_COUNTDOWN_MS;
    const settleAt = countdownEndsAt + SWITCH_CROSSOVER_MS;
    setModel("mode", "pending", { candidateId, countdownEndsAt, settleAt });
    pendingTimer = setTimeout(
      commitPendingCandidate,
      SWITCH_COUNTDOWN_MS + SWITCH_CROSSOVER_MS,
    );
  }

  function pickDestination(id: string): void {
    if (id in model.entries) {
      setModel("active", id);
    }
  }

  function applyUserInput(event: UserInputEvent): void {
    switch (event.type) {
      case "pickDestination":
      case "setActiveEntry":
        pickDestination(event.id);
        return;
    }
  }

  function applyStatusUpdateAuto(status: ModeAppState): void {
    //      let newEntries = mode.entries; // filtered by available distination
    //   let newSequence = mode.sequence // filtered by still available entries ids
    //      let newActive = mode.active; // if active still in new entries, otherwise null
    //      if !newActive {
    //          // newActive = sortByCapacityAwareLatency top entry
    //      }
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
