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
 * Decides whether a newly detected package install should reset the channel
 * preference. Returns the channel to store, or `undefined` to keep the
 * current preference.
 *
 * Only an update that actually crossed channels resets the preference — a
 * pending user switch (preference ≠ installed channel, same package) must
 * survive. When `installedVersion` is null the previous channel is unknown
 * (either a fresh install or the first run after this marker was introduced),
 * so a stored preference is left alone and only an unset one is filled in.
 */
export function resolveChannelResync(input: {
  packageVersion: string;
  installedVersion: string | null;
  channel: UpdateChannel | null;
}): UpdateChannel | undefined {
  const { packageVersion: pkg, installedVersion: recorded, channel } = input;
  const installed = detectChannel(pkg);
  const channelChanged = recorded != null &&
    detectChannel(recorded) !== installed;
  return channelChanged || !channel ? installed : undefined;
}
