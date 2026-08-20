import {
  type UpdateChannel,
  type UpdateManifest,
} from "@src/stores/settingsStore.ts";
import { compareVersions, detectChannel } from "@src/utils/version.ts";

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

/**
 * Decides whether the stored channel preference needs to be rewritten for the
 * installed package. Returns the channel to store, or `undefined` when the
 * preference already matches.
 *
 * The installed package is authoritative — the switcher is read-only, so a
 * preference that disagrees with it is always stale, never a pending user
 * switch. Reasons it can disagree: an update that crossed channels, a
 * reinstall from the other channel, or a value left over from before the
 * preference was kept in sync at all.
 */
export function resolveChannelResync(input: {
  packageVersion: string;
  channel: UpdateChannel | null;
}): UpdateChannel | undefined {
  const installed = detectChannel(input.packageVersion);
  return input.channel === installed ? undefined : installed;
}
