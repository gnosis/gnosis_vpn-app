import { describe, expect, it } from "vitest";
import type {
  ChannelRelease,
  CheckOutcome,
} from "@src/stores/settingsStore.ts";
import {
  isStaleOutcome,
  resolveChannelResync,
  resolveUpdateBlocker,
  resolveUpdateDecision,
} from "./updateAvailability.ts";

const release = (version: string): ChannelRelease => ({
  version,
  published_at: "2026-01-01T00:00:00Z",
  download_url: "https://example.com/x",
  size_bytes: "0 B",
  sha256: "x",
  artifact_signature: "x",
  release_notes: "notes",
  min_os_version: "0",
  min_app_version: "0",
});

const available = (current: string, latest: string): CheckOutcome => ({
  kind: "Available",
  current,
  release: release(latest),
});

const decide = (
  outcome: CheckOutcome | null,
  packageVersion: string | null,
  dismissedVersion: string | null = null,
) => resolveUpdateDecision({ outcome, packageVersion, dismissedVersion });

const UNDECIDED = {
  isUpToDate: undefined,
  isUpdateAvailable: false,
  release: null,
};

describe("resolveUpdateDecision", () => {
  it("decides nothing before the toolkit has been asked", () => {
    expect(decide(null, "0.28.5")).toEqual(UNDECIDED);
  });

  it("takes the toolkit's UpToDate as is", () => {
    expect(decide({ kind: "UpToDate", current: "0.29.0" }, "0.29.0"))
      .toEqual({ isUpToDate: true, isUpdateAvailable: false, release: null });
  });

  it("takes the toolkit's Available with its release", () => {
    expect(decide(available("0.28.5", "0.29.0"), "0.28.5")).toEqual({
      isUpToDate: false,
      isUpdateAvailable: true,
      release: release("0.29.0"),
    });
  });

  it("does not second-guess the toolkit's ordering", () => {
    // A local compare would call this a downgrade; the toolkit said otherwise.
    const d = decide(available("0.30.0", "0.29.0"), "0.30.0");
    expect(d.isUpToDate).toBe(false);
    expect(d.release?.version).toBe("0.29.0");
  });

  it("decides nothing on NoReleaseForChannel", () => {
    expect(
      decide({ kind: "NoReleaseForChannel", channel: "snapshot" }, "0.28.5"),
    ).toEqual(UNDECIDED);
  });

  it("drops a verdict reached for a package that is no longer installed", () => {
    // After an install: the stored Available names the old version.
    expect(decide(available("0.28.5", "0.29.0"), "0.29.0")).toEqual(UNDECIDED);
    expect(decide({ kind: "UpToDate", current: "0.28.5" }, "0.29.0"))
      .toEqual(UNDECIDED);
  });

  it("decides nothing while the package version is unknown", () => {
    expect(decide(available("0.28.5", "0.29.0"), null)).toEqual(UNDECIDED);
  });

  it("hides the banner for the dismissed release but still reports it", () => {
    expect(decide(available("0.28.5", "0.29.0"), "0.28.5", "0.29.0")).toEqual({
      isUpToDate: false,
      isUpdateAvailable: false,
      release: release("0.29.0"),
    });
  });

  it("shows the banner again once a newer release than the dismissed one lands", () => {
    expect(
      decide(available("0.28.5", "0.30.0"), "0.28.5", "0.29.0")
        .isUpdateAvailable,
    ).toBe(true);
  });
});

describe("isStaleOutcome", () => {
  it("compares the version the toolkit checked against the installed one", () => {
    expect(isStaleOutcome(available("0.28.5", "0.29.0"), "0.28.5")).toBe(false);
    expect(isStaleOutcome(available("0.28.5", "0.29.0"), "0.29.0")).toBe(true);
  });

  it("never calls a missing or version-less outcome stale", () => {
    expect(isStaleOutcome(null, "0.28.5")).toBe(false);
    expect(
      isStaleOutcome({ kind: "NoReleaseForChannel", channel: "stable" }, "1"),
    ).toBe(false);
  });
});

describe("resolveChannelResync", () => {
  it("keeps a preference that already matches the installed package", () => {
    expect(resolveChannelResync({
      packageVersion: "0.8.0",
      channel: "stable",
    })).toBeUndefined();
    expect(resolveChannelResync({
      packageVersion: "2026.08.20+build.013814",
      channel: "snapshot",
    })).toBeUndefined();
  });

  it("fills in an unset preference from the installed package", () => {
    expect(resolveChannelResync({
      packageVersion: "0.8.0",
      channel: null,
    })).toBe("stable");
    expect(resolveChannelResync({
      packageVersion: "0.8.0-rc.1",
      channel: null,
    })).toBe("snapshot");
  });

  it("overrides a preference that contradicts the installed package", () => {
    // The switcher is read-only, so a disagreeing preference is always stale —
    // e.g. a "stable" value left over on a machine running a snapshot build.
    expect(resolveChannelResync({
      packageVersion: "2026.08.20+build.013814",
      channel: "stable",
    })).toBe("snapshot");
    expect(resolveChannelResync({
      packageVersion: "0.8.0",
      channel: "snapshot",
    })).toBe("stable");
  });
});

describe("resolveUpdateBlocker", () => {
  it("says nothing while the probe is still in flight", () => {
    // Regression: "unknown" used to also mean "probed and failed", so a timed-out
    // probe rendered the ordinary tab with no version and no explanation.
    expect(
      resolveUpdateBlocker({ toolkitStatus: "unknown", packageVersion: null }),
    ).toBeNull();
    expect(
      resolveUpdateBlocker({
        toolkitStatus: "unknown",
        packageVersion: "1.0.0",
      }),
    ).toBeNull();
  });

  it("offers a retry only for a probe that ran and failed", () => {
    const failed = resolveUpdateBlocker({
      toolkitStatus: "failed",
      packageVersion: null,
    });
    expect(failed?.kind).toBe("failed");
    expect(failed?.retryable).toBe(true);
    // A reinstall is the only way out of these two, so no button.
    expect(
      resolveUpdateBlocker({ toolkitStatus: "missing", packageVersion: null })
        ?.retryable,
    ).toBe(false);
    expect(
      resolveUpdateBlocker({ toolkitStatus: "tooOld", packageVersion: null })
        ?.retryable,
    ).toBe(false);
  });

  it("blocks a working toolkit only when no source can name the package", () => {
    expect(
      resolveUpdateBlocker({ toolkitStatus: "ok", packageVersion: "0.78.0" }),
    ).toBeNull();
    expect(
      resolveUpdateBlocker({ toolkitStatus: "ok", packageVersion: null })?.kind,
    ).toBe("noPackageVersion");
  });

  it("reports a broken toolkit even when the daemon supplied a version", () => {
    // The fallback fills the version row, but checks still cannot run.
    for (const status of ["missing", "tooOld", "failed"] as const) {
      expect(
        resolveUpdateBlocker({
          toolkitStatus: status,
          packageVersion: "0.78.0",
        })
          ?.kind,
      ).toBe(status);
    }
  });
});
