import type {
  ChannelRelease,
  CheckOutcome,
  UpdateChannel,
} from "@src/stores/settingsStore.ts";
import { detectChannel } from "@src/utils/version.ts";
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
  release: ChannelRelease | null;
};

const UNDECIDED: UpdateDecision = {
  isUpToDate: undefined,
  isUpdateAvailable: false,
  release: null,
};

/** True when the toolkit reached `outcome` for a package other than the installed one. */
export function isStaleOutcome(
  outcome: CheckOutcome | null,
  packageVersion: string | null,
): boolean {
  return outcome != null && "current" in outcome &&
    outcome.current !== packageVersion;
}

/** The toolkit's verdict as the UI shows it; a stale one decides nothing. */
export function resolveUpdateDecision(input: {
  outcome: CheckOutcome | null;
  packageVersion: string | null;
  dismissedVersion: string | null;
}): UpdateDecision {
  const { outcome, packageVersion, dismissedVersion } = input;
  if (!outcome || isStaleOutcome(outcome, packageVersion)) return UNDECIDED;
  switch (outcome.kind) {
    case "UpToDate":
      return { isUpToDate: true, isUpdateAvailable: false, release: null };
    case "Available":
      return {
        isUpToDate: false,
        isUpdateAvailable: outcome.release.version !== dismissedVersion,
        release: outcome.release,
      };
    default:
      return UNDECIDED;
  }
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
