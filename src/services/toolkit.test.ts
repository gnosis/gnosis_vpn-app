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

// Fixtures are generated from the Rust types by
// `cargo test --test serialize_fixtures`, so a drift in what the toolkit
// binary hands the frontend fails here rather than at runtime.

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
