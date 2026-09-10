import {
  type DestinationState,
  formatWarmupStatus,
  isDeployingSafeRunMode,
  isPreparingSafeRunMode,
  isRunningRunMode,
  isWarmupRunMode,
  type StatusResponse,
} from "@src/services/vpnService.ts";
import { logWarn } from "@src/utils/appLog.ts";

export enum AppScreen {
  Initialization = "initialization",
  Main = "main",
  Onboarding = "onboarding",
  Synchronization = "synchronization",
}

export type SyncPhaseIndex = 0 | 1 | 2;

/** Screen to show, its status line, and when a stuck startup sync gives up. */
export type ScreenChoice = [AppScreen, string, number | null];

const MAXIMUM_DELAY_TIME = 120 * 1000; // 2 minutes

function findDelayReason(destinations: DestinationState[]): string | null {
  let missingPeers = 0;
  let missingChannels = 0;
  for (const ds of destinations) {
    if (!ds.route_health) continue;
    const s = ds.route_health.state;

    if (s.state === "ReadyToConnect" || s.state === "Connecting") return null;
    if (s.state === "NeedsChannel") missingChannels++;
    else if (s.state === "NeedsPeering") {
      missingPeers++;
      if (!s.has_channel) missingChannels++;
    }
  }
  if (missingPeers > 0 && missingPeers >= missingChannels) {
    return `Looking for ${missingPeers} more peer${
      missingPeers > 1 ? "s" : ""
    }`;
  }
  if (missingChannels > 0) {
    return `Setting up ${missingChannels} more channel${
      missingChannels > 1 ? "s" : ""
    }`;
  }
  return null;
}

export function detectSyncPhase(
  response: StatusResponse,
): SyncPhaseIndex | null {
  const { run_mode, destinations } = response;
  if (isDeployingSafeRunMode(run_mode)) return 0;
  if (isWarmupRunMode(run_mode)) return 1;
  if (findDelayReason(Object.values(destinations))) return 2;
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

  return function selectScreen(status: StatusResponse): ScreenChoice {
    const runMode = status.run_mode;
    if (runMode === "Shutdown") {
      return [AppScreen.Main, "Shutdown", null];
    }
    if (isPreparingSafeRunMode(runMode)) {
      return [AppScreen.Onboarding, "Onboarding", null];
    }
    if (syncScreenSpent) {
      return [AppScreen.Main, "Moving on", null];
    }

    if (isDeployingSafeRunMode(runMode)) {
      return [AppScreen.Synchronization, "Safe deployment ongoing", null];
    }
    if (isWarmupRunMode(runMode)) {
      return [
        AppScreen.Synchronization,
        formatWarmupStatus(runMode.Warmup.status),
        null,
      ];
    }
    // Only a running daemon counts as reaching main, so a first warmup still syncs.
    const moveOn = (): ScreenChoice => {
      initialDelay = { alreadyRan: true };
      syncScreenSpent = isRunningRunMode(runMode);
      return [AppScreen.Main, "Moving on", null];
    };

    // delay initial screen as long as no interaction makes sense
    const delay = findDelayReason(status.destinations);
    if (!delay) return moveOn();
    // delay proposed and never ran - start the delay
    if ("neverRan" in initialDelay) {
      const delayingSince = Date.now();
      initialDelay = { delayingSince };
      return [
        AppScreen.Synchronization,
        delay,
        delayingSince + MAXIMUM_DELAY_TIME,
      ];
    }
    // delay proposed and already in delay - continue until the maximum time is reached
    if ("delayingSince" in initialDelay) {
      if (Date.now() - initialDelay.delayingSince > MAXIMUM_DELAY_TIME) {
        logWarn(`Initial sync still "${delay}" after 2 minutes, moving on`);
        return moveOn();
      }
      return [
        AppScreen.Synchronization,
        delay,
        initialDelay.delayingSince + MAXIMUM_DELAY_TIME,
      ];
    }
    // delay proposed but already ran
    return moveOn();
  };
}
