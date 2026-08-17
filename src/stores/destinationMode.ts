// Stub for the reworked destination-mode data model. Types only for now —
// see [[backupDestinationMode.ts]] for the implementation being replaced.

export type DestinationOrigin = "auto" | "user";

export interface DestinationEntry {
  id: string;
  origin: DestinationOrigin;
  key: number;
}

export interface AutoPending {
  candidateId: string;
  countdownEndsAt: number;
  settleAt: number;
}

export type DestinationModel =
  | { phase: "uninitialized" }
  | {
    phase: "auto";
    entries: DestinationEntry[];
    activeId: string;
    pending: AutoPending | null;
  }
  | {
    phase: "selected";
    entries: DestinationEntry[];
    activeId: string;
    autoRevertAt: number;
  }
  | {
    phase: "connecting";
    entries: DestinationEntry[];
    activeId: string;
  };
