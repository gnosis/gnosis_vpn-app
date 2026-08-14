import { batch, createEffect } from "solid-js";
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
import { getSortLatencyMs, isReadyToConnect } from "@src/utils/exitHealth.ts";

// How long a better auto-candidate is held pending before it settles; also
// the flat, unconditional deadline for any `selected`-phase entry to revert
// back to `auto` (see docs/destination-mode.md).
export const SWITCH_COUNTDOWN_MS = 5_000;
export const SELECTED_AUTO_REVERT_MS = 10_000;
// Total duration of the (UI-owned) slide animation once a switch starts.
export const SWITCH_ANIMATE_MS = 1_000;
// Offset within the animation window at which the candidate becomes the
// resolved connect target — before this, the outgoing destination is still
// unambiguously "current" on screen; this is deliberately a fixed constant
// rather than a live DOM/pixel measurement. See docs/destination-mode.md.
export const SWITCH_CROSSOVER_MS = 500;

export type DestinationOrigin = "auto" | "user";

export interface DestinationEntry {
  id: string;
  origin: DestinationOrigin;
  // Render/reconcile identity, separate from `id` — lets a re-picked
  // destination that's already elsewhere in history mount as a fresh card
  // instead of reconciling into (and silently repositioning) the old one.
  key: number;
}

export interface AutoPending {
  candidateId: string;
  // Plain 5s countdown boundary — what the UI's countdown ring animates.
  countdownEndsAt: number;
  // countdownEndsAt + SWITCH_CROSSOVER_MS — what resolveConnectTarget and the
  // actual commit use; the slide animation plays between the two.
  settleAt: number;
}

// The history banner's list IS the model — each phase carries the fields
// meaningful to it instead of one flat shape full of "only meaningful when
// ..." nullables. `activeId` is never null past `uninitialized`; a
// `selected` entry always has its revert deadline (the flat 10s timer is
// unconditional, however the entry was reached). The one fact that's
// genuinely optional is whether `auto` currently has a pending candidate.
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

type DestinationModelActions = {
  // Scrolling the banner to a card already in `entries` (rule 10). A no-op
  // for unknown ids and while `connecting` — a live connection is only ever
  // retargeted through a real connect() call, reflected back via rule 12.
  setActiveEntry: (id: string) => void;
  // Picking a destination from the vertical ExitNodeList — any known
  // destination, not just one already in the banner (rules 9 & 14).
  pickDestination: (id: string) => void;
};

type DestinationModeStoreTuple = readonly [
  SolidStore<DestinationModel>,
  DestinationModelActions,
];

function initialModel(): DestinationModel {
  return { phase: "uninitialized" };
}

export function createDestinationMode(
  appState: ModeAppState,
  settings: ModeSettingsState,
): DestinationModeStoreTuple {
  const [mode, setMode] = createStore<DestinationModel>(initialModel());
  // reconcile() diffs and applies changed keys one at a time rather than as
  // one atomic write — an effect reading both `entries` and `pending` (e.g.
  // LocationBanner's) can otherwise observe a torn intermediate state where
  // only one of the two has updated yet. batch() defers dependent effects
  // until every key from a single model transition has landed.
  const commitMode = (value: DestinationModel) =>
    batch(() => setMode(reconcile(value, { key: "key" })));

  let nextEntryKey = 0;
  const freshEntry = (
    id: string,
    origin: DestinationOrigin,
  ): DestinationEntry => ({ id, origin, key: nextEntryKey++ });

  // Fires at most once per app run (this store's lifetime) — see
  // docs/destination-mode.md's promotion rule. Not part of the exposed
  // state, and not reset by anything short of recreating this store.
  let preferredPromotionUsed = false;
  // Gates the one-time startup decision (rules 2-4) so it only ever runs
  // before the first real destinations batch has been resolved into a mode.
  let startupDecided = false;
  // Remembered so `connecting -> selected` (rule 15) still knows which
  // destination to land on even once the backend fields themselves clear.
  let lastActiveId: string | null = null;

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

  // Whether a pending candidate is still a legitimate reason to switch away
  // from `activeId` — not just "some other id currently ranks first", since
  // that can happen simply because this candidate itself got worse (went
  // unready, or its latency regressed past activeId's). Only true when the
  // candidate is still ready *and* still strictly better than staying put.
  const isPendingCandidateStillWorthwhile = (
    candidateId: string,
    activeId: string,
  ) => {
    const candidateInfo = appState.destinations[candidateId];
    if (
      candidateInfo === undefined ||
      !isReadyToConnect(candidateInfo.route_health ?? undefined)
    ) {
      return false;
    }
    const candidateLatency = getSortLatencyMs(candidateInfo);
    const activeInfo = appState.destinations[activeId];
    const activeLatency = activeInfo && getSortLatencyMs(activeInfo);
    if (candidateLatency === null || activeLatency == null) return true;
    return candidateLatency < activeLatency;
  };

  // The one place a `selected` phase gets constructed — every path in
  // (startup, promotion, a pick, post-disconnect) always starts the same
  // unconditional flat-10s revert; the type only allows building `selected`
  // with a deadline attached, so there's no way to forget it here.
  const startSelected = (entries: DestinationEntry[], activeId: string) => {
    clearPendingTimer();
    clearRevertTimer();
    const autoRevertAt = Date.now() + SELECTED_AUTO_REVERT_MS;
    commitMode({ phase: "selected", entries, activeId, autoRevertAt });
    revertTimeout = setTimeout(() => {
      revertTimeout = undefined;
      if (mode.phase !== "selected") return;
      commitMode({
        phase: "auto",
        entries: mode.entries,
        activeId: mode.activeId,
        pending: null,
      });
    }, SELECTED_AUTO_REVERT_MS);
  };

  // Reads the candidate from live state rather than a closure argument —
  // startCandidatePending may have retargeted `pending.candidateId` since
  // this timeout was scheduled (see its mid-countdown swap branch), and the
  // timer itself is never rescheduled when that happens.
  const commitCandidate = () => {
    pendingTimeout = undefined;
    if (mode.phase !== "auto" || mode.pending === null) return;
    const { entries, pending } = mode;
    const candidateId = pending.candidateId;
    if (
      candidateId === settings.preferredLocation && !preferredPromotionUsed
    ) {
      preferredPromotionUsed = true;
      startSelected(entries, candidateId);
      return;
    }
    commitMode({
      phase: "auto",
      entries,
      activeId: candidateId,
      pending: null,
    });
  };

  // Rules 1-4 (startup) and 12/15 (connecting/disconnecting) — the backend's
  // connected/connecting/reconnecting fields always take priority over
  // anything else, and losing them always lands on `selected`, with no
  // interstitial "disconnecting" mode to wait on.
  createEffect(() => {
    const liveId = appState.connected?.destination_id ??
      appState.connecting?.destination_id ??
      appState.reconnecting?.destination_id ??
      null;

    if (liveId !== null) {
      startupDecided = true;
      lastActiveId = liveId;
      if (mode.phase !== "connecting" || mode.activeId !== liveId) {
        clearPendingTimer();
        clearRevertTimer();
        const existingEntries = mode.phase === "uninitialized"
          ? []
          : mode.entries;
        const entries = existingEntries.some((e) => e.id === liveId)
          ? existingEntries
          : [...existingEntries, freshEntry(liveId, "auto")];
        commitMode({ phase: "connecting", entries, activeId: liveId });
      }
      return;
    }

    if (mode.phase === "connecting") {
      startSelected(mode.entries, lastActiveId ?? mode.activeId);
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
      startSelected([freshEntry(preferredId, "auto")], preferredId);
      return;
    }

    const persistedId = settings.lastConnectedDestination;
    const persistedKnown = persistedId !== null &&
      appState.destinations[persistedId] !== undefined;
    if (persistedId !== null && persistedKnown) {
      startupDecided = true;
      startSelected([freshEntry(persistedId, "auto")], persistedId);
      return;
    }

    const initialId = bestCandidateId();
    if (initialId === null) return;
    startupDecided = true;
    commitMode({
      phase: "auto",
      entries: [freshEntry(initialId, "auto")],
      activeId: initialId,
      pending: null,
    });
  });

  // Rule 5 — arms (or retargets) a pending switch to `candidateId`: appends
  // it to `entries` as a speculative auto-origin entry (unless already
  // present), starts the countdown, and schedules the commit.
  const startCandidatePending = (candidateId: string) => {
    if (mode.phase !== "auto") return;
    const { activeId, pending, entries } = mode;
    if (pending?.candidateId === candidateId) return;

    if (pending !== null && Date.now() >= pending.countdownEndsAt) {
      // The pulse/slide for the current transition is already scheduled (or
      // playing) — let it finish targeting the original candidate instead of
      // retargeting it out from under LocationBanner's countdown effect,
      // which would kick off a second, overlapping animation. The detection
      // effect that called us reruns the instant this transition commits, so
      // a still-better candidate starts its own fresh pending immediately
      // after.
      return;
    }

    // A different candidate supersedes an earlier one that never settled —
    // drop its speculative entry rather than leaving it stranded.
    const withoutStalePending = pending
      ? entries.filter((e) => e.id !== pending.candidateId)
      : entries;
    const nextEntries = withoutStalePending.some((e) => e.id === candidateId)
      ? withoutStalePending
      : [...withoutStalePending, freshEntry(candidateId, "auto")];

    if (pending !== null) {
      // Still within the 5s countdown, nothing has animated yet — retarget
      // the in-flight transition instead of restarting its timer.
      commitMode({
        phase: "auto",
        entries: nextEntries,
        activeId,
        pending: { ...pending, candidateId },
      });
      return;
    }

    const countdownEndsAt = Date.now() + SWITCH_COUNTDOWN_MS;
    const settleAt = countdownEndsAt + SWITCH_CROSSOVER_MS;
    commitMode({
      phase: "auto",
      entries: nextEntries,
      activeId,
      pending: { candidateId, countdownEndsAt, settleAt },
    });
    pendingTimeout = setTimeout(
      () => commitCandidate(),
      SWITCH_COUNTDOWN_MS + SWITCH_CROSSOVER_MS,
    );
  };

  // Shared by both revert paths below — clears the timer, drops the
  // speculative entry, and cancels the transition outright rather than
  // falling back to whatever else now ranks best.
  const cancelPending = (
    activeId: string,
    pending: AutoPending,
    entries: DestinationEntry[],
  ) => {
    clearPendingTimer();
    commitMode({
      phase: "auto",
      entries: entries.filter((e) => e.id !== pending.candidateId),
      activeId,
      pending: null,
    });
  };

  // Rules 5-8 — the auto candidate-detection loop. Only active while
  // `mode.phase === "auto"`; runs forever, never exits itself except through
  // commitCandidate's preferred-promotion branch above.
  createEffect(() => {
    if (mode.phase !== "auto") {
      clearPendingTimer();
      return;
    }
    const candidateId = bestCandidateId();
    const { activeId, pending, entries } = mode;

    if (candidateId === null || candidateId === activeId) {
      if (pending !== null) cancelPending(activeId, pending, entries);
      return;
    }

    if (
      pending !== null &&
      pending.candidateId !== candidateId &&
      Date.now() < pending.countdownEndsAt &&
      !isPendingCandidateStillWorthwhile(pending.candidateId, activeId)
    ) {
      // The candidate we were about to switch to got worse (no longer ready,
      // or no longer actually better than staying put) — cancel the whole
      // transition rather than chasing whatever now ranks best as a
      // fallback. Once countdownEndsAt has passed, leave it be instead (same
      // reasoning as startCandidatePending's own guard below) — the
      // detection effect self-corrects the instant it commits regardless.
      cancelPending(activeId, pending, entries);
      return;
    }

    startCandidatePending(candidateId);
  });

  // Rule 16 — a `selected` (not `connecting`) entry that *stops* being
  // ready-to-connect drops back into `auto`; the effect above then picks up
  // immediately (same reactive flush) and starts its normal candidate-pending
  // sequence toward the best remaining destination. This only fires on an
  // actual ready -> not-ready transition of the *same* entry, tracked via the
  // previous run's snapshot — a fresh selection (manual pick or swipe-back)
  // hasn't necessarily been (re-)probed as ready yet, and must still get its
  // full flat 10s grace window (startSelected's autoRevertAt) rather than
  // being bounced straight back to `auto` in the same tick it was selected.
  createEffect(
    (prev: { activeId: string; wasReady: boolean } | null) => {
      if (mode.phase !== "selected") return null;
      const destInfo = appState.destinations[mode.activeId];
      // No data yet for this entry — an unconfirmed pick isn't the same as a
      // known-bad one; leave the last-known snapshot untouched rather than
      // treating "no data" as "not ready" for the transition check below.
      if (destInfo === undefined) return prev;
      const isReady = isReadyToConnect(destInfo.route_health ?? undefined);
      const droppedReady = prev !== null && prev.activeId === mode.activeId &&
        prev.wasReady && !isReady;
      if (droppedReady) {
        clearRevertTimer();
        commitMode({
          phase: "auto",
          entries: mode.entries,
          activeId: mode.activeId,
          pending: null,
        });
        return null;
      }
      return { activeId: mode.activeId, wasReady: isReady };
    },
    null,
  );

  const actions: DestinationModelActions = {
    setActiveEntry: (id) => {
      if (mode.phase === "uninitialized" || mode.phase === "connecting") {
        return;
      }
      if (!mode.entries.some((e) => e.id === id)) return;
      const entries = mode.phase === "auto" && mode.pending &&
          mode.pending.candidateId !== id
        ? mode.entries.filter((e) => e.id !== mode.pending!.candidateId)
        : mode.entries;
      startSelected(entries, id);
    },

    pickDestination: (id) => {
      if (mode.phase === "uninitialized") return;
      if (mode.phase === "connecting") {
        if (mode.entries.some((e) => e.id === id)) return;
        commitMode({
          phase: "connecting",
          entries: [...mode.entries, freshEntry(id, "user")],
          activeId: mode.activeId,
        });
        return;
      }
      const baseEntries = mode.phase === "auto" && mode.pending
        ? mode.entries.filter((e) => e.id !== mode.pending!.candidateId)
        : mode.entries;

      if (id === mode.activeId) {
        // Already the active card — re-tag its origin in place rather than
        // minting a fresh key, so it doesn't fade/remount for a no-op pick.
        const nextEntries = baseEntries.map((e) =>
          e.id === id ? { ...e, origin: "user" as const } : e
        );
        startSelected(nextEntries, id);
        return;
      }
      // The outgoing active entry and any stale copy of the pick elsewhere in
      // history both go — a fresh key for the pick below always mounts a new
      // card instead of reconciling into (and silently repositioning) one of
      // theirs just because it happens to share this destination id.
      const withoutOutgoing = baseEntries.filter((e) =>
        e.id !== mode.activeId && e.id !== id
      );
      startSelected([...withoutOutgoing, freshEntry(id, "user")], id);
    },
  };

  return [mode, actions] as const;
}

/** What Connect should target right now, given the current model. Before an
 * auto pending candidate's settleAt, the outgoing destination is still the
 * unambiguous target; at/after it, the incoming candidate is. */
export function resolveConnectTarget(
  model: DestinationModel,
  now: number,
): string | null {
  if (model.phase === "uninitialized") return null;
  if (model.phase === "selected" || model.phase === "connecting") {
    return model.activeId;
  }
  if (model.pending && now >= model.pending.settleAt) {
    return model.pending.candidateId;
  }
  return model.activeId;
}

/** What's currently shown, ignoring an in-flight pending candidate — display
 * only follows `activeId` once the auto loop actually commits it, same
 * instant `resolveConnectTarget` would flip to it too. */
export function currentDisplayId(model: DestinationModel): string | null {
  if (model.phase === "uninitialized") return null;
  return model.activeId;
}
