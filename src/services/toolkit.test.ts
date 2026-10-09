import { describe, expect, it } from "vitest";
import { CheckResultSchema, ToolkitInfoSchema } from "@src/services/toolkit.ts";
import available from "./fixtures/check_result_available.json" with {
  type: "json",
};
import upToDate from "./fixtures/check_result_up_to_date.json" with {
  type: "json",
};
import noRelease from "./fixtures/check_result_no_release.json" with {
  type: "json",
};
import toolkitInfo from "./fixtures/toolkit_info.json" with { type: "json" };

// Fixtures come from the Rust types via `cargo test --test serialize_fixtures`,
// so drift fails here rather than at runtime.

describe("ToolkitInfoSchema", () => {
  it("parses the generated fixture", () => {
    const parsed = ToolkitInfoSchema.parse(toolkitInfo);
    expect(parsed.version).toBe("0.4.0");
    expect(parsed.package_version).toBe("0.78.0");
  });

  // The binary exits 0 with null when /etc/gnosisvpn/version.txt is absent.
  it("accepts a null package version", () => {
    const parsed = ToolkitInfoSchema.parse({
      version: "0.4.0",
      package_version: null,
    });
    expect(parsed.package_version).toBeNull();
  });
});

describe("CheckResultSchema", () => {
  it("parses an available update, carrying the release and the manifest", () => {
    const parsed = CheckResultSchema.parse(available);
    expect(parsed.channel).toBe("stable");
    if (parsed.outcome.kind !== "Available") {
      throw new Error(`unexpected outcome: ${parsed.outcome.kind}`);
    }
    expect(parsed.outcome.release.version).toBe("0.29.0");
    expect(parsed.manifest?.channels.stable?.version).toBe("0.29.0");
    expect(parsed.end_of_life?.version).toBe("0.28.5");
    expect(parsed.end_of_life?.ends_at).toBe("2026-10-15T00:00:00Z");
  });

  it("parses a result whose package is not covered by an end of life", () => {
    expect(CheckResultSchema.parse(upToDate).end_of_life).toBeNull();
  });

  it("drops an end of life whose date does not parse", () => {
    const parsed = CheckResultSchema.parse({
      ...available,
      end_of_life: { ...available.end_of_life, ends_at: "soon" },
    });
    expect(parsed.end_of_life).toBeNull();
    expect(parsed.outcome.kind).toBe("Available");
  });

  // Toolkits before the end-of-life verdict never send the key.
  it("accepts a result without the end_of_life key", () => {
    const { end_of_life: _, ...older } = available;
    expect(CheckResultSchema.parse(older).end_of_life).toBeUndefined();
  });

  it("parses an up-to-date result", () => {
    const parsed = CheckResultSchema.parse(upToDate);
    expect(parsed.outcome.kind).toBe("UpToDate");
    expect(parsed.manifest).not.toBeNull();
  });

  it("parses a channel with no release, naming the channel", () => {
    const parsed = CheckResultSchema.parse(noRelease);
    if (parsed.outcome.kind !== "NoReleaseForChannel") {
      throw new Error(`unexpected outcome: ${parsed.outcome.kind}`);
    }
    expect(parsed.outcome.channel).toBe("snapshot");
    expect(parsed.outcome.current).toBe("2026.07.01+build.000001");
  });

  // Toolkits before `current` sent only the channel, which Rust passes on without the key.
  it("accepts a no-release outcome without the installed version", () => {
    const parsed = CheckResultSchema.parse({
      ...noRelease,
      outcome: { kind: "NoReleaseForChannel", channel: "snapshot" },
    });
    expect(parsed.outcome).toEqual({
      kind: "NoReleaseForChannel",
      channel: "snapshot",
    });
  });

  // The three outcomes that never fetched one omit the manifest; the app keeps
  // whatever it already stored rather than clearing it.
  it("accepts a result without a manifest", () => {
    const parsed = CheckResultSchema.parse({
      channel: "stable",
      outcome: { kind: "VpnNotConnected" },
      manifest: null,
    });
    expect(parsed.manifest).toBeNull();
  });

  // ByteSize serializes human-readable; the published manifest has a number,
  // which the Rust side converts. Either way the frontend sees a string.
  it("requires size_bytes to be a string", () => {
    const release = {
      ...(available.outcome as { release: Record<string, unknown> }).release,
      size_bytes: 123456789,
    };
    const result = CheckResultSchema.safeParse({
      ...available,
      outcome: { ...available.outcome, release },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown outcome kind", () => {
    const result = CheckResultSchema.safeParse({
      channel: "stable",
      outcome: { kind: "Rebooting" },
      manifest: null,
    });
    expect(result.success).toBe(false);
  });
});
