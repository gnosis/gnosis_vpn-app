import { createEffect, createRoot } from "solid-js";
import { createStore, type Store as SolidStore } from "solid-js/store";

import type {
  ConnectedInfo,
  ConnectingInfo,
  Destination,
  DestinationState,
  ReconnectingInfo,
} from "@src/services/vpnService.ts";
import { resolveAutoDestination } from "@src/utils/destinations.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";

// How long a better destination is shown as a countdown on the current
// card before it slides in and becomes active.
export const SWITCH_COUNTDOWN_MS = 5_000;

/** The slice of AppState the banner reacts to — kept minimal so it can be
 * driven by lightweight fakes in tests instead of the full app store. */
export interface BannerAppState {
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  vpnStatus: string;
  connected: ConnectedInfo | null;
  connecting: ConnectingInfo | null;
  reconnecting: ReconnectingInfo | null;
}

/** The slice of SettingsState the banner reacts to. */
export interface BannerSettingsState {
  preferredLocation: string | null;
  lastConnectedDestination: string | null;
}

export interface BannerState {
  // Destination ids, oldest -> left, newest/best -> rightmost.
  order: string[];
  // Drives connect() target + the health-detail card.
  activeId: string | null;
  // False once the user scrolls or taps away from the rightmost card;
  // auto-evaluation pauses until they return to it.
  viewingLatest: boolean;
  pendingCandidateId: string | null;
  countdownEndsAt: number | null;
  initialized: boolean;
  // Set once by LocationBanner's onMount. Everything below stays frozen
  // until then, so the initial pick and any switch countdown only ever
  // happen once the user can actually see the banner — otherwise both
  // could run to completion behind an earlier screen (e.g. during the
  // Synchronization screen's MIN_SCREEN_DISPLAY_TIME hold), and the user
  // would land on the main screen to find destinations already added
  // that they never saw appear.
  visible: boolean;
}

type BannerActions = {
  setActiveId: (id: string) => void;
  noteViewingLatest: (isLatest: boolean) => void;
  markVisible: () => void;
  reset: () => void;
};

type BannerStoreTuple = readonly [SolidStore<BannerState>, BannerActions];

function initialBannerState(): BannerState {
  return {
    order: [],
    activeId: null,
    viewingLatest: true,
    pendingCandidateId: null,
    countdownEndsAt: null,
    initialized: false,
    visible: false,
  };
}

const isConnectedFreeze = (vpnStatus: string) =>
  vpnStatus === "Connected" ||
  vpnStatus === "Connecting" ||
  vpnStatus === "Reconnecting";

export function createBannerStore(
  appState: BannerAppState,
  settings: BannerSettingsState,
): BannerStoreTuple {
  const [state, setState] = createStore<BannerState>(initialBannerState());

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  // Every multi-field transition below uses a single object-form setState
  // call rather than sequential path calls — path calls each notify
  // dependents immediately, so a countdown-cancelling write could otherwise
  // be observed mid-transition by the detection effect below and
  // immediately restart the very countdown it was meant to clear.
  const clearCountdown = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = undefined;
    }
    if (state.pendingCandidateId !== null || state.countdownEndsAt !== null) {
      setState({ pendingCandidateId: null, countdownEndsAt: null });
    }
  };

  // Becoming active always makes a destination the newest/rightmost card —
  // if it already has a stale, earlier spot in the trail (e.g. a past pick
  // that's back in favor), that spot is dropped rather than left behind as
  // a duplicate history entry.
  const asNewestOrder = (id: string) => [
    ...state.order.filter((existing) => existing !== id),
    id,
  ];

  const commitCandidate = (id: string) => {
    timeoutHandle = undefined;
    setState({
      order: asNewestOrder(id),
      activeId: id,
      viewingLatest: true,
      pendingCandidateId: null,
      countdownEndsAt: null,
    });
  };

  // Picks the initial banner destination once the first batch of
  // destinations arrives: the live backend connection wins (reopening the
  // app mid-connection), otherwise the persisted last-connected id (if it's
  // still a known destination), otherwise the best/preferred candidate.
  createEffect(() => {
    if (!state.visible) return;
    if (state.initialized) return;
    // Both fields land in the same status update in production
    // (appStore.ts sets `destinations` before `availableDestinations`), but
    // wait for both regardless of write order so this never latches onto a
    // half-updated snapshot.
    if (appState.availableDestinations.length === 0) return;
    if (Object.keys(appState.destinations).length === 0) return;

    const liveActiveId = appState.connected?.destination_id ??
      appState.connecting?.destination_id ??
      appState.reconnecting?.destination_id ??
      null;
    const persistedId = settings.lastConnectedDestination;
    const persistedIsKnown = persistedId !== null &&
      appState.destinations[persistedId] !== undefined;
    const candidate = resolveAutoDestination(
      appState.availableDestinations,
      appState.destinations,
      settings.preferredLocation,
    );

    const initialId = liveActiveId ??
      (persistedIsKnown ? persistedId : null) ??
      candidate?.id ??
      null;
    if (!initialId) return;

    setState({
      order: [initialId],
      activeId: initialId,
      viewingLatest: true,
      initialized: true,
    });
  });

  // Detects a strictly-different (per resolveAutoDestination's
  // preferred-then-lowest-latency rule) candidate and runs the
  // countdown-then-append sequence. Frozen entirely while connected, or
  // while the user has scrolled away from the latest card.
  createEffect(() => {
    if (!state.visible) return;
    if (!state.initialized) return;

    if (isConnectedFreeze(appState.vpnStatus) || !state.viewingLatest) {
      clearCountdown();
      return;
    }

    const candidate = resolveAutoDestination(
      appState.availableDestinations,
      appState.destinations,
      settings.preferredLocation,
    );

    if (!candidate || candidate.id === state.activeId) {
      clearCountdown();
      return;
    }

    if (state.pendingCandidateId === candidate.id) return;

    if (timeoutHandle) clearTimeout(timeoutHandle);
    const candidateId = candidate.id;
    setState({
      pendingCandidateId: candidateId,
      countdownEndsAt: Date.now() + SWITCH_COUNTDOWN_MS,
    });
    timeoutHandle = setTimeout(
      () => commitCandidate(candidateId),
      SWITCH_COUNTDOWN_MS,
    );
  });

  const actions: BannerActions = {
    setActiveId: (id) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      setState({
        pendingCandidateId: null,
        countdownEndsAt: null,
        order: asNewestOrder(id),
        activeId: id,
        viewingLatest: true,
      });
    },
    noteViewingLatest: (isLatest) => setState("viewingLatest", isLatest),
    markVisible: () => {
      if (!state.visible) setState("visible", true);
    },
    reset: () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      // Preserve visible across a reset (e.g. criticalError): it tracks
      // whether the banner has ever been shown, not the destination data
      // being cleared, and LocationBanner won't call markVisible again
      // unless it actually remounts.
      setState({ ...initialBannerState(), visible: state.visible });
    },
  };

  return [state, actions] as const;
}

const bannerStore = createRoot(() => {
  const [appState] = useAppStore();
  const [settings] = useSettingsStore();
  return createBannerStore(appState, settings);
});

export function useBannerStore(): BannerStoreTuple {
  return bannerStore;
}
