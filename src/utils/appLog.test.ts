import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DestinationState,
  RunMode,
  StatusResponse,
} from "@src/services/vpnService.ts";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn((_cmd: string, _args: { message: string }) =>
    Promise.resolve()
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main" }),
}));

const RUNNING: RunMode = {
  Running: { funding_status: null, hopr_status: null },
};

const DESTINATION: DestinationState = {
  destination: {
    id: "dest-1",
    meta: { location: "Brazil" },
    address: "0xexit",
    routing: 1,
  },
  route_health: null,
};

function status(target_destination: string | null): StatusResponse {
  return {
    run_mode: RUNNING,
    destinations: [DESTINATION],
    target_destination,
    connected: null,
    connecting: null,
    reconnecting: null,
    disconnecting: [],
  };
}

describe("logStatus", () => {
  // appLog dedupes against a module-level last message; reload it per case
  let logStatus: (response: StatusResponse) => void;

  beforeEach(async () => {
    invokeMock.mockClear();
    vi.resetModules();
    ({ logStatus } = await import("./appLog.ts"));
  });

  const loggedMessage = () => invokeMock.mock.lastCall?.[1].message;

  it("logs a parked reconnect instead of claiming disconnected", () => {
    logStatus(status("dest-1"));
    expect(loggedMessage()).toBe(
      "Reconnecting: dest-1 - Brazil - waiting for route",
    );
  });

  it("logs disconnected when no target is left over", () => {
    logStatus(status(null));
    expect(loggedMessage()).toMatch(/^Disconnected\. Available:/);
  });
});
