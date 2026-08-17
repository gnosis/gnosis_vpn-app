// Stub for the reworked destination-mode data model. Types only for now —
// see [[backupDestinationMode.ts]] for the implementation being replaced.

export type DestinationOrigin = "auto" | "user";

export interface Entry {
  id: string;
  origin: DestinationOrigin;
  // renderkey, continously incremented
  key: number;
}

export interface AutoPending {
  candidateId: string;
  countdownEndsAt: number;
  settleAt: number;
}

export type Mode =
  | { phase: "auto"; pending: AutoPending | null }
  | { phase: "selected"; autoRevertAt: number }
  | { phase: "connecting" };

export type DestinationMode = {
  entries: Map<string, Entry>;
  sequence: string[];
  active: string | null;
  mode: Mode;
};
