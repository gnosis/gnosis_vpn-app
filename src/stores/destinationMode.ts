import { createStore, type Store as SolidStore } from "solid-js/store";

import type {
  ConnectedInfo,
  ConnectingInfo,
  Destination,
  DestinationState,
  ReconnectingInfo,
} from "@src/services/vpnService.ts";

export type Origin = "auto" | "user";

export interface Entry {
  origin: Origin;
  // Render/reconcile identity — see backupDestinationMode's DestinationEntry.key.
  key: number;
}

// "uninitialized" isn't a separate tag — `active === null` covers it.
export type Mode = "auto" | "selected" | "connecting";

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
  const [model, _setModel] = createStore<DestinationMode>(
    initialModel(settings),
  );

  function applyUserInput(event: UserInputEvent): void {
    switch (event.type) {
      case "pickDestination":
        throw new Error("not implemented");
      case "setActiveEntry":
        throw new Error("not implemented");
    }
  }

  return {
    model,
    applyStatusUpdate: (_status: ModeAppState) => {
      throw new Error("not implemented");
    },
    applyUserInput,
  };
}
