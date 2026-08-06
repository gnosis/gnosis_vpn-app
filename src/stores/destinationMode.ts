import { createEffect } from "solid-js";
import {
  createStore,
  reconcile,
  type Store as SolidStore,
} from "solid-js/store";

import type {
  ConnectedInfo,
  ConnectingInfo,
  Destination,
  DestinationState,
  ReconnectingInfo,
} from "@src/services/vpnService.ts";
import { resolveAutoDestination } from "@src/utils/destinations.ts";
import { isReadyToConnect } from "@src/utils/exitHealth.ts";

// How long a better auto-candidate is held pending before it settles.
export const SWITCH_COUNTDOWN_MS = 5_000;
// Grace period after a manual exit-node-list pick before it unconditionally
// reverts to auto, regardless of whether it still matches the auto pick.
export const SELECTED_AUTO_REVERT_MS = 10_000;
// Total duration of the (UI-owned) slide animation once a switch starts.
export const SWITCH_ANIMATE_MS = 1_000;
// Offset within the animation window at which the candidate becomes the
// resolved connect target — before this, the outgoing destination is still
// unambiguously "current" on screen; this is deliberately a fixed constant
// rather than a live DOM/pixel measurement. See docs/destination-mode.md.
export const SWITCH_CROSSOVER_MS = 500;

export interface AutoPending {
  candidateId: string;
  // Plain 5s countdown boundary — what the UI's countdown ring animates.
  countdownEndsAt: number;
  // countdownEndsAt + SWITCH_CROSSOVER_MS — what resolveConnectTarget and the
  // actual commit use; the slide animation plays between the two.
  settleAt: number;
}

export type DestinationMode =
  | { kind: "auto"; current: string | null; pending: AutoPending | null }
  | { kind: "selected"; id: string; autoRevertAt: number | null }
  | { kind: "active"; id: string };

/** The slice of AppState this store reacts to — kept minimal so it can be
 * driven by lightweight fakes in tests instead of the full app store. */
export interface ModeAppState {
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  connected: ConnectedInfo | null;
  connecting: ConnectingInfo | null;
  reconnecting: ReconnectingInfo | null;
}

/** The slice of SettingsState this store reacts to. */
export interface ModeSettingsState {
  preferredLocation: string | null;
  lastConnectedDestination: string | null;
}

/** UI-driven input: pauses the auto candidate-detection loop (rules 5-8)
 * while the user has scrolled the carousel away from the latest card, so
 * nothing changes underneath them. Everything else (startup, connecting/
 * disconnecting, the `selected` auto-revert) ignores this. */
export interface ModeUiState {
  viewingLatest: boolean;
}

type DestinationModeActions = {
  selectDestination: (id: string) => void;
};

type DestinationModeStoreTuple = readonly [
  SolidStore<DestinationMode>,
  DestinationModeActions,
];

function initialMode(): DestinationMode {
  return { kind: "auto", current: null, pending: null };
}

export function createDestinationMode(
  appState: ModeAppState,
  settings: ModeSettingsState,
  ui: ModeUiState,
): DestinationModeStoreTuple {
  const [mode, setMode] = createStore<DestinationMode>(initialMode());

  // Fires at most once per app run (this store's lifetime) — see
  // docs/destination-mode.md's promotion rule. Not part of the exposed
  // state, and not reset by anything short of recreating this store.
  let preferredPromotionUsed = false;
  // Gates the one-time startup decision (rules 2-4) so it only ever runs
  // before the first real destinations batch has been resolved into a mode.
  let startupDecided = false;
  // Remembered so `active -> selected` (rule 15) still knows which
  // destination to land on even once `disconnecting` itself clears out.
  let lastActiveId: string | null = null;
  // True only while the current `selected` mode came from a manual
  // selectDestination() call — gates which of the two revert mechanisms
  // below (unconditional grace timer vs. matches-best-pick) applies.
  let selectedManually = false;

  let pendingTimeout: ReturnType<typeof setTimeout> | undefined;
  const clearPendingTimer = () => {
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = undefined;
    }
  };

  let revertTimeout: ReturnType<typeof setTimeout> | undefined;
  const clearRevertTimer = () => {
    if (revertTimeout) {
      clearTimeout(revertTimeout);
      revertTimeout = undefined;
    }
  };

  const bestCandidateId = () =>
    resolveAutoDestination(
      appState.availableDestinations,
      appState.destinations,
      settings.preferredLocation,
    )?.id ?? null;

  const commitCandidate = (candidateId: string) => {
    pendingTimeout = undefined;
    if (
      candidateId === settings.preferredLocation && !preferredPromotionUsed
    ) {
      preferredPromotionUsed = true;
      selectedManually = false;
      setMode(
        reconcile({ kind: "selected", id: candidateId, autoRevertAt: null }),
      );
      return;
    }
    setMode(reconcile({ kind: "auto", current: candidateId, pending: null }));
  };

  // Rules 1-4 (startup) and 14-15 (connecting/disconnecting) — the backend's
  // connected/connecting/reconnecting fields always take priority over
  // anything else, and losing them always lands on `selected`, ignoring any
  // lingering `disconnecting` entries (no waiting on teardown).
  createEffect(() => {
    const liveId = appState.connected?.destination_id ??
      appState.connecting?.destination_id ??
      appState.reconnecting?.destination_id ??
      null;

    if (liveId !== null) {
      startupDecided = true;
      lastActiveId = liveId;
      if (mode.kind !== "active" || mode.id !== liveId) {
        clearPendingTimer();
        clearRevertTimer();
        setMode(reconcile({ kind: "active", id: liveId }));
      }
      return;
    }

    if (mode.kind === "active") {
      selectedManually = false;
      setMode(
        reconcile({
          kind: "selected",
          id: lastActiveId ?? mode.id,
          autoRevertAt: null,
        }),
      );
      return;
    }

    if (startupDecided) return;
    if (appState.availableDestinations.length === 0) return;
    if (Object.keys(appState.destinations).length === 0) return;

    const preferredId = settings.preferredLocation;
    const preferredReady = preferredId !== null && isReadyToConnect(
      appState.destinations[preferredId]?.route_health ?? undefined,
    );
    if (preferredId !== null && preferredReady) {
      startupDecided = true;
      preferredPromotionUsed = true;
      selectedManually = false;
      setMode(
        reconcile({ kind: "selected", id: preferredId, autoRevertAt: null }),
      );
      return;
    }

    const persistedId = settings.lastConnectedDestination;
    const persistedKnown = persistedId !== null &&
      appState.destinations[persistedId] !== undefined;
    if (persistedId !== null && persistedKnown) {
      startupDecided = true;
      selectedManually = false;
      setMode(
        reconcile({ kind: "selected", id: persistedId, autoRevertAt: null }),
      );
      return;
    }

    startupDecided = true;
    setMode(
      reconcile({ kind: "auto", current: bestCandidateId(), pending: null }),
    );
  });

  // Rules 5-8 — the auto candidate-detection loop. Only active while
  // `mode.kind === "auto"` and the carousel is showing its latest card; runs
  // forever, never exits itself except through commitCandidate's
  // preferred-promotion branch above.
  createEffect(() => {
    if (mode.kind !== "auto") {
      clearPendingTimer();
      return;
    }
    // Unlike leaving "auto" entirely (whoever changes `kind` already
    // installs a fresh object with no `pending`), freezing here is the only
    // thing that would otherwise leave a stale, timer-less `pending` behind.
    if (!ui.viewingLatest) {
      clearPendingTimer();
      if (mode.pending !== null) {
        setMode(
          reconcile({ kind: "auto", current: mode.current, pending: null }),
        );
      }
      return;
    }
    const candidateId = bestCandidateId();
    const { current, pending } = mode;

    if (candidateId === null || candidateId === current) {
      if (pending !== null) {
        clearPendingTimer();
        setMode(reconcile({ kind: "auto", current, pending: null }));
      }
      return;
    }
    if (pending?.candidateId === candidateId) return;

    clearPendingTimer();
    const countdownEndsAt = Date.now() + SWITCH_COUNTDOWN_MS;
    const settleAt = countdownEndsAt + SWITCH_CROSSOVER_MS;
    setMode(
      reconcile({
        kind: "auto",
        current,
        pending: { candidateId, countdownEndsAt, settleAt },
      }),
    );
    pendingTimeout = setTimeout(
      () => commitCandidate(candidateId),
      SWITCH_COUNTDOWN_MS + SWITCH_CROSSOVER_MS,
    );
  });

  // Rules 12-13 — the one auto-behavior allowed while `selected` via a
  // non-manual path (preferred promotion, startup, post-disconnect): if the
  // selected id keeps matching auto's current best for a sustained 5s,
  // revert to auto instead of staying sticky. Manual picks instead run their
  // own unconditional grace timer, managed directly in selectDestination
  // below — this effect leaves those alone.
  createEffect(() => {
    if (mode.kind !== "selected") {
      clearRevertTimer();
      return;
    }
    if (selectedManually) return;
    const { id, autoRevertAt } = mode;
    const matchesBest = bestCandidateId() === id;

    if (!matchesBest) {
      if (autoRevertAt !== null) {
        clearRevertTimer();
        setMode(reconcile({ kind: "selected", id, autoRevertAt: null }));
      }
      return;
    }
    if (autoRevertAt !== null) return;

    clearRevertTimer();
    const revertAt = Date.now() + SWITCH_COUNTDOWN_MS;
    setMode(reconcile({ kind: "selected", id, autoRevertAt: revertAt }));
    revertTimeout = setTimeout(() => {
      revertTimeout = undefined;
      setMode(reconcile({ kind: "auto", current: id, pending: null }));
    }, SWITCH_COUNTDOWN_MS);
  });

  const actions: DestinationModeActions = {
    // Rules 9-11: a manual pick unconditionally reverts to auto after
    // SELECTED_AUTO_REVERT_MS, regardless of whether it still matches the
    // auto pick — re-picking (even the same id) restarts the grace timer.
    selectDestination: (id) => {
      if (mode.kind === "active") return;
      clearPendingTimer();
      clearRevertTimer();
      selectedManually = true;
      const autoRevertAt = Date.now() + SELECTED_AUTO_REVERT_MS;
      setMode(reconcile({ kind: "selected", id, autoRevertAt }));
      revertTimeout = setTimeout(() => {
        revertTimeout = undefined;
        selectedManually = false;
        setMode(reconcile({ kind: "auto", current: id, pending: null }));
      }, SELECTED_AUTO_REVERT_MS);
    },
  };

  return [mode, actions] as const;
}

/** What Connect should target right now, given the current mode. Before an
 * auto pending candidate's settleAt, the outgoing destination is still the
 * unambiguous target; at/after it, the incoming candidate is. */
export function resolveConnectTarget(
  mode: DestinationMode,
  now: number,
): string | null {
  if (mode.kind === "selected" || mode.kind === "active") return mode.id;
  if (mode.pending && now >= mode.pending.settleAt) {
    return mode.pending.candidateId;
  }
  return mode.current;
}

/** What's currently shown, ignoring an in-flight pending candidate — display
 * only follows `current` once the auto loop actually commits it, same
 * instant `resolveConnectTarget` would flip to it too. */
export function currentDisplayId(mode: DestinationMode): string | null {
  if (mode.kind === "auto") return mode.current;
  return mode.id;
}

export interface DestinationOrderState {
  // Destination ids, oldest -> left, newest/current -> rightmost.
  order: string[];
  // Whether the most recent order change should slide-animate in the
  // carousel. False only for a destination picked directly from the list
  // (matched below); every auto-driven change animates.
  animate: boolean;
}

type DestinationOrderActions = {
  selectDestination: (id: string) => void;
};

/** Tracks carousel presentation on top of an existing mode store: which ids
 * have been shown (for the history carousel) and whether the latest change
 * should jump or slide. Kept separate from `createDestinationMode` itself so
 * that state machine stays free of presentation concerns. */
export function createDestinationOrder(
  mode: SolidStore<DestinationMode>,
  modeActions: { selectDestination: (id: string) => void },
): readonly [SolidStore<DestinationOrderState>, DestinationOrderActions] {
  const [state, setState] = createStore<DestinationOrderState>({
    order: [],
    animate: true,
  });

  // Set by our own selectDestination wrapper, consumed by the effect below
  // once the resulting display change actually happens — which may be
  // immediate (idle pick) or only after a later backend event (mid-session
  // retarget while already active).
  let pendingManualId: string | null = null;

  createEffect(() => {
    const id = currentDisplayId(mode);
    if (id === null) return;
    const lastId = state.order.length > 0
      ? state.order[state.order.length - 1]
      : null;
    if (id === lastId) return;

    const animate = pendingManualId !== id;
    if (pendingManualId === id) pendingManualId = null;

    setState({
      order: [...state.order.filter((existing) => existing !== id), id],
      animate,
    });
  });

  return [state, {
    selectDestination: (id) => {
      pendingManualId = id;
      modeActions.selectDestination(id);
    },
  }] as const;
}
