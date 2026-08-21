import type { Store as SolidStore } from "solid-js/store";

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

// "uninitialized" isn't a separate tag here — `active === null` covers it,
// since no state before the first resolved status needs its own transition
// rules.
export type Mode = "auto" | "selected" | "connecting";

export interface DestinationMode {
  entries: Record<string, Entry>;
  sequence: string[];
  active: string | null;
  mode: Mode;
  // Monotonic, never reused — deriving it from array position or
  // `entries.size` would let a re-added id collide with a stale render key.
  nextKey: number;
  // From the settings store, not statusResponse — both fixed at creation
  // time (see DestinationModeSettings below) and never touched by
  // applyStatusUpdate.
  preferredLocation: string | null;
  lastConnectedDestination: string | null;
}

/** The slice of AppState a status update carries. Defined locally (not
 * imported from backupDestinationMode.ts) so this module has no dependency
 * on the implementation it's meant to replace. */
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

export function createDestinationMode(
  _settings: DestinationModeSettings,
): DestinationModeHandle {
  throw new Error("not implemented");
}
