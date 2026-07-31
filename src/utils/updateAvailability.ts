import { type UpdateManifest } from "@src/stores/settingsStore.ts";
import { compareVersions, detectChannel } from "@src/utils/version.ts";

export type UpdateDecision = {
  isUpToDate: boolean | undefined;
  isUpdateAvailable: boolean;
  availableVersion: string | null;
};

// The channel is always derived from the installed package version, so the
// comparison below is always same-channel (never calver vs semver).
export function evaluateUpdate(input: {
  packageVersion: string | null;
  manifest: UpdateManifest | null;
  dismissedVersion: string | null;
}): UpdateDecision {
  const { packageVersion: pkg, manifest, dismissedVersion } = input;
  if (!pkg || !manifest) {
    return {
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    };
  }
  const effectiveChannel = detectChannel(pkg);
  const latest = manifest.channels[effectiveChannel]?.version ?? null;
  if (!latest) {
    return {
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    };
  }
  const hasUpdate = compareVersions(pkg, latest) < 0;
  return {
    isUpToDate: !hasUpdate,
    isUpdateAvailable: hasUpdate && dismissedVersion !== latest,
    availableVersion: hasUpdate ? latest : null,
  };
}
