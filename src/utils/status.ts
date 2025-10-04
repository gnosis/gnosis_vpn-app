import {
  type Destination,
  PreparingSafe,
  type Status,
} from "@src/services/vpnService.ts";

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

export function isPreparingSafe(
  status: Status,
): status is { PreparingSafe: PreparingSafe } {
  return typeof status === "object" && "PreparingSafe" in status;
}

function firstHexBigintGreaterThanZero(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0];
  if (typeof first !== "string") return false;
  try {
    const n = BigInt(first);
    return n > 0n;
  } catch {
    return false;
  }
}

export function isXDAITransferred(status: Status): boolean {
  return (
    isPreparingSafe(status) &&
    firstHexBigintGreaterThanZero(
      (status.PreparingSafe as unknown as { node_xdai: unknown }).node_xdai,
    )
  );
}

export function isWxHOPRTransferred(status: Status): boolean {
  return (
    isPreparingSafe(status) &&
    firstHexBigintGreaterThanZero(
      (status.PreparingSafe as unknown as { node_wxhopr: unknown }).node_wxhopr,
    )
  );
}
