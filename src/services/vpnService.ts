import { invoke } from '@tauri-apps/api/core';

export type WireGuardStatus = 'Up' | 'Down' | 'ManuallyManaged';

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
  | 'ServiceUnavailable'
  | 'Disconnected';

export interface StatusResponse {
  wireguard: WireGuardStatus;
  status: Status;
  available_destinations: Destination[];
}

export type ConnectResponse = { Connecting: Destination } | 'AddressNotFound';
export type DisconnectResponse =
  | { Disconnecting: Destination }
  | 'NotConnected';

export class VPNService {
  static async getStatus(): Promise<StatusResponse> {
    try {
      return (await invoke('status')) as StatusResponse;
    } catch (error) {
      console.error('Failed to get VPN status:', error);
      throw new Error(`Status Error: ${error}`);
    }
  }

  static async connect(address: string): Promise<ConnectResponse> {
    try {
      return (await invoke('connect', { address })) as ConnectResponse;
    } catch (error) {
      console.error('Failed to connect to VPN:', error);
      throw new Error(`Connect Error: ${error}`);
    }
  }

  static async disconnect(): Promise<DisconnectResponse> {
    try {
      return (await invoke('disconnect')) as DisconnectResponse;
    } catch (error) {
      console.error('Failed to disconnect from VPN:', error);
      throw new Error(`Disconnect Error: ${error}`);
    }
  }

  static getBestDestination(
    destinations: StatusResponse['available_destinations']
  ): string | null {
    if (destinations.length === 0) return null;

    // Sort by address for consistent selection
    const sorted = [...destinations].sort((a, b) =>
      a.address.localeCompare(b.address)
    );
    return sorted[0].address;
  }

  static formatDestination(
    destination: StatusResponse['available_destinations'][0]
  ): string {
    const country = destination.meta.country || 'Unknown';
    const city = destination.meta.city || '';
    return city ? `${country} - ${city}` : country;
  }
}

export function isConnected(
  status: Status
): status is { Connected: Destination } {
  return typeof status === 'object' && 'Connected' in status;
}

export function isConnecting(
  status: Status
): status is { Connecting: Destination } {
  return typeof status === 'object' && 'Connecting' in status;
}

export function isDisconnecting(
  status: Status
): status is { Disconnecting: Destination } {
  return typeof status === 'object' && 'Disconnecting' in status;
}

export function isDisconnected(status: Status): status is 'Disconnected' {
  return status === 'Disconnected';
}

export function isServiceUnavailable(
  status: Status
): status is 'ServiceUnavailable' {
  return status === 'ServiceUnavailable';
}

export function isConnectedTo(
  status: Status,
  destination: Destination
): boolean {
  return (
    isConnected(status) && status.Connected.address === destination.address
  );
}

export function isConnectingTo(
  status: Status,
  destination: Destination
): boolean {
  return (
    isConnecting(status) && status.Connecting.address === destination.address
  );
}

export function isDisconnectingFrom(
  status: Status,
  destination: Destination
): boolean {
  return (
    isDisconnecting(status) &&
    status.Disconnecting.address === destination.address
  );
}
