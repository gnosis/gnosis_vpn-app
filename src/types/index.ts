export interface StatusResponse {
  wireguard: WireGuardStatus;
  status: Status;
  available_destinations: Destination[];
}

export type ConnectResponse = { Connecting: Destination } | "AddressNotFound";
export type DisconnectResponse = { Disconnecting: Destination } | "NotConnected";

export type WireGuardStatus = "Up" | "Down" | "ManuallyManaged";

export type Status =
  | { Connecting: Destination }
  | { Disconnecting: Destination }
  | { Connected: Destination }
  | "Disconnected";

export interface Destination {
  meta: Record<string, string>;
  address: string;
  path: Path;
}

export type Path = { Hops: number } | { IntermediatePath: string[] };

// Type guards
export function isConnected(status: Status): status is { Connected: Destination } {
  return typeof status === "object" && "Connected" in status;
}

export function isConnecting(status: Status): status is { Connecting: Destination } {
  return typeof status === "object" && "Connecting" in status;
}

export function isDisconnecting(status: Status): status is { Disconnecting: Destination } {
  return typeof status === "object" && "Disconnecting" in status;
}

export function isDisconnected(status: Status): status is "Disconnected" {
  return status === "Disconnected";
}