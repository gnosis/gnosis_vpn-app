import { describe, expect, it } from "vitest";
import type { StatusResponse } from "@src/services/vpnService.ts";
import {
  isConnected,
  isConnecting,
  isDisconnected,
  isDisconnecting,
} from "./status.ts";

const BASE: StatusResponse = {
  run_mode: "NotRunning",
  destinations: [],
  target_destination: null,
  connected: null,
  connecting: null,
  reconnecting: null,
  disconnecting: [],
};

const CONNECTING_INFO = {
  destination_id: "dest-1",
  phase: "Init" as const,
};

const RECONNECTING_INFO = {
  destination_id: "dest-1",
  since: 0,
  phase: "Init" as const,
};

const DISCONNECTING_INFO = {
  destination_id: "dest-1",
  phase: "Disconnecting" as const,
};

describe("isConnected", () => {
  it("returns true when connected is a destination id", () => {
    expect(isConnected({ ...BASE, connected: "dest-1" })).toBe(true);
  });

  it("returns false when connected is null", () => {
    expect(isConnected(BASE)).toBe(false);
  });
});

describe("isConnecting", () => {
  it("returns true when connecting info is present", () => {
    expect(isConnecting({ ...BASE, connecting: CONNECTING_INFO })).toBe(true);
  });

  it("returns true when reconnecting info is present", () => {
    expect(isConnecting({ ...BASE, reconnecting: RECONNECTING_INFO })).toBe(
      true,
    );
  });

  it("returns false when connecting is null", () => {
    expect(isConnecting(BASE)).toBe(false);
  });
});

describe("isDisconnecting", () => {
  it("returns true when disconnecting list is non-empty", () => {
    expect(
      isDisconnecting({ ...BASE, disconnecting: [DISCONNECTING_INFO] }),
    ).toBe(true);
  });

  it("returns false when disconnecting list is empty", () => {
    expect(isDisconnecting(BASE)).toBe(false);
  });
});

describe("isDisconnected", () => {
  it("returns true when connected, connecting and disconnecting are all absent", () => {
    expect(isDisconnected(BASE)).toBe(true);
  });

  it("returns false when connected", () => {
    expect(isDisconnected({ ...BASE, connected: "dest-1" })).toBe(false);
  });

  it("returns false when connecting", () => {
    expect(isDisconnected({ ...BASE, connecting: CONNECTING_INFO })).toBe(
      false,
    );
  });

  it("returns false when reconnecting", () => {
    expect(isDisconnected({ ...BASE, reconnecting: RECONNECTING_INFO })).toBe(
      false,
    );
  });

  it("returns false when disconnecting", () => {
    expect(
      isDisconnected({ ...BASE, disconnecting: [DISCONNECTING_INFO] }),
    ).toBe(false);
  });
});
