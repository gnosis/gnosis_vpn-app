import { type Destination, type Status } from "@src/services/vpnService.ts";

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
  return isConnected(status) &&
    status.Connected.address === destination.address;
}

export function isConnectingTo(
  status: Status,
  destination: Destination,
): boolean {
  return isConnecting(status) &&
    status.Connecting.address === destination.address;
}

export function isDisconnectingFrom(
  status: Status,
  destination: Destination,
): boolean {
  return isDisconnecting(status) &&
    status.Disconnecting.address === destination.address;
}
