import {
  formatWarmupStatus,
  isDeployingSafeRunMode,
  isPreparingSafeRunMode,
  isRunningRunMode,
  isWarmupRunMode,
  type PreparingSafe,
  type StatusResponse,
} from "@src/services/vpnService.ts";
import { logWarn } from "@src/utils/appLog.ts";
import { isSelectable, rankContext } from "@src/utils/destinations.ts";

export enum AppScreen {
  Initialization = "initialization",
  Main = "main",
  Onboarding = "onboarding",
  Synchronization = "synchronization",
  ServiceNotRunning = "serviceNotRunning",
}

export type SyncPhaseIndex = 0 | 1 | 2;

/** Screen to show, its status line, and the error a retrying sync waits to recover from. */
export type ScreenChoice = [AppScreen, string, string | null];

/** How long a stuck startup sync waits for a route before moving on. */
export const MAXIMUM_DELAY_TIME = 3 * 60 * 1000;

/** Nothing to interact with until one destination is connectable. */
function findDelayReason(status: StatusResponse): string | null {
  const known = status.destinations.filter((ds) => ds.route_health !== null);
  if (known.length === 0) return null;
  const context = rankContext(status);
  if (known.some((ds) => isSelectable(ds, context))) return null;
  const unrecoverable =
    known.filter((ds) => ds.route_health?.state.state === "Unrecoverable")
      .length;
  if (unrecoverable === known.length) return null;
  const waiting = known.length - unrecoverable;
  return `Looking for a route to ${waiting} destination${
    waiting > 1 ? "s" : ""
  }`;
}

// Daemon only deploys once the node holds the recommended balance.
function isUnderfunded(safe: PreparingSafe): boolean {
  const rec = safe.balance_recommendation;
  if (!rec) return false;
  return safe.node_xdai < rec.xdai || safe.node_wxhopr < rec.wxhopr;
}

/** A failed safe deployment the daemon retries by itself, without the user topping up. */
function retryingSafeDeployment(status: StatusResponse): string | null {
  const runMode = status.run_mode;
  if (!isPreparingSafeRunMode(runMode)) return null;
  const safe = runMode.PreparingSafe;
  if (!safe.error || isUnderfunded(safe)) return null;
  return safe.error;
}

export function detectSyncPhase(
  response: StatusResponse,
): SyncPhaseIndex | null {
  const { run_mode } = response;
  if (isDeployingSafeRunMode(run_mode)) return 0;
  if (isWarmupRunMode(run_mode)) return 1;
  if (findDelayReason(response)) return 2;
  return null;
}

/** Picks the screen for one app run; the sync screen is only shown on the way to main. */
export function createScreenSelector(): (
  status: StatusResponse,
) => ScreenChoice {
  let initialDelay:
    | { delayingSince: number }
    | { neverRan: true }
    | { alreadyRan: true } = { neverRan: true };
  // Spent once a running daemon reaches main; the sync screen has no Disconnect button.
  let syncScreenSpent = false;
  let safeDeployStarted = false;

  return function selectScreen(status: StatusResponse): ScreenChoice {
    const runMode = status.run_mode;
    if (runMode === "Shutdown") {
      return [AppScreen.Main, "Shutdown", null];
    }
    if (runMode === "InUseByOtherUser") {
      return [AppScreen.Main, "In use by another user", null];
    }
    if (isPreparingSafeRunMode(runMode)) {
      const deployError = retryingSafeDeployment(status);
      if (!syncScreenSpent && safeDeployStarted && deployError) {
        return [
          AppScreen.Synchronization,
          "Safe deployment failed, retrying",
          deployError,
        ];
      }
      return [AppScreen.Onboarding, "Onboarding", null];
    }
    if (syncScreenSpent) {
      return [AppScreen.Main, "Moving on", null];
    }

    if (isDeployingSafeRunMode(runMode)) {
      safeDeployStarted = true;
      return [AppScreen.Synchronization, "Safe deployment ongoing", null];
    }
    if (isWarmupRunMode(runMode)) {
      return [
        AppScreen.Synchronization,
        formatWarmupStatus(runMode.Warmup.status),
        runMode.Warmup.last_error,
      ];
    }
    // Only a running daemon counts as reaching main, so a first warmup still syncs.
    const moveOn = (): ScreenChoice => {
      initialDelay = { alreadyRan: true };
      syncScreenSpent = isRunningRunMode(runMode);
      return [AppScreen.Main, "Moving on", null];
    };

    // delay initial screen as long as no interaction makes sense
    const delay = findDelayReason(status);
    if (!delay) return moveOn();
    // delay proposed and never ran - start the delay
    if ("neverRan" in initialDelay) {
      initialDelay = { delayingSince: Date.now() };
      return [AppScreen.Synchronization, delay, null];
    }
    // delay proposed and already in delay - continue until the maximum time is reached
    if ("delayingSince" in initialDelay) {
      if (Date.now() - initialDelay.delayingSince > MAXIMUM_DELAY_TIME) {
        logWarn(
          `Initial sync still "${delay}" after ${
            MAXIMUM_DELAY_TIME / 60_000
          } minutes, moving on`,
        );
        return moveOn();
      }
      return [AppScreen.Synchronization, delay, null];
    }
    // delay proposed but already ran
    return moveOn();
  };
}
