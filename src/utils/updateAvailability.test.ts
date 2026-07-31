import { describe, expect, it } from "vitest";
import type {
  ChannelRelease,
  UpdateManifest,
} from "@src/stores/settingsStore.ts";
import { evaluateUpdate } from "./updateAvailability.ts";

const release = (version: string): ChannelRelease => ({
  version,
  published_at: "2026-01-01T00:00:00Z",
  download_url: "https://example.com/x",
  size_bytes: "0 B",
  sha256: "x",
  artifact_signature: "x",
  release_notes: "",
  min_os_version: "0",
  min_app_version: "0",
});

const stableManifest = (v: string): UpdateManifest => ({
  schema_version: 1,
  generated_at: "2026-01-01T00:00:00Z",
  channels: { stable: release(v), snapshot: null },
});

const snapshotManifest = (v: string): UpdateManifest => ({
  schema_version: 1,
  generated_at: "2026-01-01T00:00:00Z",
  channels: { stable: null, snapshot: release(v) },
});

const fullManifest = (stable: string, snapshot: string): UpdateManifest => ({
  schema_version: 1,
  generated_at: "2026-01-01T00:00:00Z",
  channels: { stable: release(stable), snapshot: release(snapshot) },
});

describe("missing inputs", () => {
  it("returns isUpToDate=undefined when packageVersion is null", () => {
    expect(evaluateUpdate({
      packageVersion: null,
      manifest: stableManifest("0.8.0"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });

  it("returns isUpToDate=undefined when packageVersion is empty string", () => {
    expect(evaluateUpdate({
      packageVersion: "",
      manifest: stableManifest("0.8.0"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });

  it("returns isUpToDate=undefined when manifest is null", () => {
    expect(evaluateUpdate({
      packageVersion: "0.8.0",
      manifest: null,
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });

  it("returns isUpToDate=undefined when manifest.channels[effectiveChannel] is null", () => {
    // Real-world case (commit 469025b): manifest exists but the derived
    // channel has no release. effectiveChannel="stable" from pkg="0.8.0".
    expect(evaluateUpdate({
      packageVersion: "0.8.0",
      manifest: snapshotManifest("0.8.0+build.1"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });

  it("returns isUpToDate=undefined when manifest version string is empty", () => {
    const emptyManifest: UpdateManifest = {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00Z",
      channels: { stable: release(""), snapshot: null },
    };
    expect(evaluateUpdate({
      packageVersion: "0.8.0",
      manifest: emptyManifest,
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: undefined,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });
});

describe("version-shape edge cases (current contract)", () => {
  it("treats missing version components as zero (semver-style)", () => {
    expect(evaluateUpdate({
      packageVersion: "1.2",
      manifest: stableManifest("1.2.0"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: true,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });
});

describe("stable channel (derived from packageVersion)", () => {
  it("reports update available when installed is lower than latest stable", () => {
    expect(evaluateUpdate({
      packageVersion: "0.7.5",
      manifest: stableManifest("0.8.0"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: false,
      isUpdateAvailable: true,
      availableVersion: "0.8.0",
    });
  });

  it("reports up-to-date when installed equals latest stable", () => {
    expect(evaluateUpdate({
      packageVersion: "0.8.0",
      manifest: stableManifest("0.8.0"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: true,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });

  it("reports up-to-date when installed is newer than latest stable", () => {
    // Downgrade scenario: never offer a downgrade.
    expect(evaluateUpdate({
      packageVersion: "0.9.0",
      manifest: stableManifest("0.8.0"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: true,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });
});

describe("snapshot channel (derived from packageVersion) — build metadata (+build.N)", () => {
  it("reports update available when installed snapshot is older", () => {
    // detectChannel("0.7.5+build.7") -> "snapshot"
    expect(evaluateUpdate({
      packageVersion: "0.7.5+build.7",
      manifest: snapshotManifest("0.7.5+build.10"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: false,
      isUpdateAvailable: true,
      availableVersion: "0.7.5+build.10",
    });
  });

  it("reports up-to-date when installed snapshot equals latest", () => {
    expect(evaluateUpdate({
      packageVersion: "0.7.5+build.10",
      manifest: snapshotManifest("0.7.5+build.10"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: true,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });

  it("reports up-to-date when installed snapshot is newer than latest", () => {
    const result = evaluateUpdate({
      packageVersion: "0.7.5+build.20",
      manifest: snapshotManifest("0.7.5+build.10"),
      dismissedVersion: null,
    });
    expect(result.isUpToDate).toBe(true);
  });
});

describe("snapshot channel (derived from packageVersion) — pre-release suffix (-rc.N)", () => {
  it("reports update available when pre-release pkg core is older than manifest core", () => {
    // compareVersions strips '-rc.1', so "1.0.0-rc.1" core == "1.0.0".
    const result = evaluateUpdate({
      packageVersion: "1.0.0-rc.1",
      manifest: snapshotManifest("1.1.0"),
      dismissedVersion: null,
    });
    expect(result.isUpdateAvailable).toBe(true);
    expect(result.availableVersion).toBe("1.1.0");
  });

  it("reports up-to-date when pre-release pkg core equals manifest core", () => {
    const result = evaluateUpdate({
      packageVersion: "1.0.0-rc.1",
      manifest: snapshotManifest("1.0.0"),
      dismissedVersion: null,
    });
    expect(result.isUpToDate).toBe(true);
  });
});

describe("GNO-689 regression — channel follows the installed package", () => {
  it("stable install stays up-to-date even when a newer snapshot exists", () => {
    // The VM scenario: rotsee/snapshot install replaced by jura/stable
    // 0.91.1. A persisted "snapshot" channel used to force a false update
    // to the snapshot build; the channel input no longer exists, so a
    // stale disk value cannot influence the result.
    expect(evaluateUpdate({
      packageVersion: "0.91.1",
      manifest: fullManifest("0.91.1", "2026.07.31+build.14043"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: true,
      isUpdateAvailable: false,
      availableVersion: null,
    });
  });

  it("stable install is offered stable updates while a snapshot entry exists", () => {
    expect(evaluateUpdate({
      packageVersion: "0.91.1",
      manifest: fullManifest("0.92.0", "2026.07.31+build.14043"),
      dismissedVersion: null,
    })).toEqual({
      isUpToDate: false,
      isUpdateAvailable: true,
      availableVersion: "0.92.0",
    });
  });

  it("a stale snapshot dismissedVersion does not suppress a real stable update", () => {
    const result = evaluateUpdate({
      packageVersion: "0.91.1",
      manifest: fullManifest("0.92.0", "2026.07.31+build.14043"),
      dismissedVersion: "2026.07.31+build.14042",
    });
    expect(result.isUpdateAvailable).toBe(true);
    expect(result.availableVersion).toBe("0.92.0");
  });
});

describe("dismissed version", () => {
  it("reports isUpdateAvailable=false when latest equals dismissedVersion", () => {
    // Helper contract: dismissal does NOT null availableVersion.
    expect(evaluateUpdate({
      packageVersion: "0.7.5",
      manifest: stableManifest("0.8.0"),
      dismissedVersion: "0.8.0",
    })).toEqual({
      isUpToDate: false,
      isUpdateAvailable: false,
      availableVersion: "0.8.0",
    });
  });

  it("still reports isUpdateAvailable=true when dismissedVersion is an older release", () => {
    const result = evaluateUpdate({
      packageVersion: "0.7.5",
      manifest: stableManifest("0.8.0"),
      dismissedVersion: "0.7.9",
    });
    expect(result.isUpdateAvailable).toBe(true);
    expect(result.availableVersion).toBe("0.8.0");
  });

  it("ignores dismissedVersion=null", () => {
    const result = evaluateUpdate({
      packageVersion: "0.7.5",
      manifest: stableManifest("0.8.0"),
      dismissedVersion: null,
    });
    expect(result.isUpdateAvailable).toBe(true);
  });
});
