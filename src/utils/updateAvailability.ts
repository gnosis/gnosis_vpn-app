import {
  type UpdateChannel,
  type UpdateManifest,
} from "@src/stores/settingsStore.ts";
import { compareVersions, detectChannel } from "@src/utils/version.ts";
import type { ToolkitStatus } from "@src/stores/appStore.ts";

/** A blocker is shown instead of the tab; only `failed` is worth a retry button. */
export type UpdateBlocker = {
  kind: "missing" | "tooOld" | "failed" | "noPackageVersion";
  message: string;
  retryable: boolean;
};

export type UpdateDecision = {
  isUpToDate: boolean | undefined;
  isUpdateAvailable: boolean;
  availableVersion: string | null;
};

export function evaluateUpdate(input: {
  packageVersion: string | null;
  manifest: UpdateManifest | null;
  channel: UpdateChannel | null;
  dismissedVersion: string | null;
}): UpdateDecision {
  const { packageVersion: pkg, manifest, channel, dismissedVersion } = input;
  if (!pkg || !manifest) {
    return {
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    };
  }
  const effectiveChannel = channel ?? detectChannel(pkg);
  const latest = manifest.channels[effectiveChannel]?.version ?? null;
  if (!latest) {
    return {
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    };
  }
  const channelMismatch = detectChannel(pkg) !== effectiveChannel;
  const hasUpdate = channelMismatch || compareVersions(pkg, latest) < 0;
  return {
    isUpToDate: !hasUpdate,
    isUpdateAvailable: hasUpdate && dismissedVersion !== latest,
    availableVersion: hasUpdate ? latest : null,
  };
}

/** Returns the channel to store, or `undefined` when the preference already matches the installed package. */
export function resolveChannelResync(input: {
  packageVersion: string;
  channel: UpdateChannel | null;
}): UpdateChannel | undefined {
  const installed = detectChannel(input.packageVersion);
  return input.channel === installed ? undefined : installed;
}

/** Why the Updates tab cannot run checks, if it cannot. `unknown` is the probe
 * still being in flight, so it yields nothing rather than a premature verdict. */
export function resolveUpdateBlocker(input: {
  toolkitStatus: ToolkitStatus;
  packageVersion: string | null;
}): UpdateBlocker | null {
  switch (input.toolkitStatus) {
    case "missing":
      return {
        kind: "missing",
        message: "Update tool not installed — please reinstall Gnosis VPN",
        retryable: false,
      };
    case "tooOld":
      return {
        kind: "tooOld",
        message: "Update tool is out of date — please reinstall Gnosis VPN",
        retryable: false,
      };
    case "failed":
      return {
        kind: "failed",
        message: "Couldn't reach the update tool",
        retryable: true,
      };
    case "ok":
      // The tool answered but neither it nor the daemon can name the package.
      if (input.packageVersion) return null;
      return {
        kind: "noPackageVersion",
        message: "Package version not found — please reinstall",
        retryable: false,
      };
    case "unknown":
      return null;
  }
}
