import { invoke } from "@tauri-apps/api/core";

export type Path = { Hops: number } | { IntermediatePath: string[] };
export interface Destination {
  meta: Record<string, string>;
  address: string;
  path: Path;
}

export type Status =
  | { Connecting: Destination }
  | { Disconnecting: Destination }
  | { Connected: Destination }
  | "ServiceUnavailable"
  | "Disconnected";

export type FundingIssue =
  | "Unfunded" // cannot work at all - initial state
  | "ChannelsOutOfFunds" // does not work - no traffic possible
  | "SafeOutOfFunds" // keeps working - cannot top up channels
  | "SafeLowOnFunds" // warning before SafeOutOfFunds
  | "NodeUnderfunded" // keeps working until channels are drained - cannot open new or top up existing channels
  | "NodeLowOnFunds"; // warning before NodeUnderfunded

export type FundingState =
  | "Unknown"
  | { TopIssue: FundingIssue }
  | "WellFunded";

export type StatusResponse = {
  status: Status;
  available_destinations: Destination[];
  network: string | null;
  funding: FundingState;
};

export type ConnectResponse = { Connecting: Destination } | "AddressNotFound";
export type DisconnectResponse =
  | { Disconnecting: Destination }
  | "NotConnected";

export type Addresses = {
  node: string;
  safe: string;
};

export type BalanceResponse = {
  node: string;
  safe: string;
  channels_out: string;
  addresses: Addresses;
  issues: FundingIssue[];
};

export class VPNService {
  static async getStatus(): Promise<StatusResponse> {
    try {
      return (await invoke("status")) as StatusResponse;
    } catch (error) {
      console.error("Failed to get VPN status:", error);
      throw new Error(`Status Error: ${error}`);
    }
  }

  static async connect(address: string): Promise<ConnectResponse> {
    try {
      return (await invoke("connect", { address })) as ConnectResponse;
    } catch (error) {
      console.error("Failed to connect to VPN:", error);
      throw new Error(`Connect Error: ${error}`);
    }
  }

  static async disconnect(): Promise<DisconnectResponse> {
    try {
      return (await invoke("disconnect")) as DisconnectResponse;
    } catch (error) {
      console.error("Failed to disconnect from VPN:", error);
      throw new Error(`Disconnect Error: ${error}`);
    }
  }

  /**
   * Request latest balance from VPN node.
   * Will return `null` if balance information was not yet available.
   * Regularly updates every 60 seconds - can be manually triggered via **refreshNode()**.
   */
  static async balance(): Promise<BalanceResponse | null> {
    try {
      return (await invoke("balance")) as BalanceResponse | null;
    } catch (error) {
      console.error("Failed to query VPN balance", error);
      throw new Error(`Balance Error: ${error}`);
    }
  }

  static async refreshNode(): Promise<void> {
    try {
      await invoke("refresh_node");
    } catch (error) {
      console.error("Failed to request VPN node balance update", error);
      throw new Error(`Refresh Node Error: ${error}`);
    }
  }

  static getBestDestination(
    destinations: StatusResponse["available_destinations"],
  ): string | null {
    if (destinations.length === 0) return null;

    // Sort by address for consistent selection
    const sorted = [...destinations].sort((a, b) =>
      a.address.localeCompare(b.address)
    );
    return sorted[0].address;
  }
}

export function isConnected(
  status: Status,
): status is { Connected: Destination } {
  return typeof status === "object" && "Connected" in status;
}

export function isConnecting(
  status: Status,
): status is { Connecting: Destination } {
  return typeof status === "object" && "Connecting" in status;
}

export function isDisconnecting(
  status: Status,
): status is { Disconnecting: Destination } {
  return typeof status === "object" && "Disconnecting" in status;
}

export function isDisconnected(status: Status): status is "Disconnected" {
  return status === "Disconnected";
}

export function isServiceUnavailable(
  status: Status,
): status is "ServiceUnavailable" {
  return status === "ServiceUnavailable";
}

export function isConnectedTo(
  status: Status,
  destination: Destination,
): boolean {
  return (
    isConnected(status) && status.Connected.address === destination.address
  );
}

export function isConnectingTo(
  status: Status,
  destination: Destination,
): boolean {
  return (
    isConnecting(status) && status.Connecting.address === destination.address
  );
}

export function isDisconnectingFrom(
  status: Status,
  destination: Destination,
): boolean {
  return (
    isDisconnecting(status) &&
    status.Disconnecting.address === destination.address
  );
}
