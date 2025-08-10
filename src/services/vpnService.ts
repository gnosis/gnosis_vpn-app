import { invoke } from "@tauri-apps/api/core";
import type { 
  StatusResponse, 
  ConnectResponse, 
  DisconnectResponse 
} from '../types';

export class VPNService {
  static async getStatus(): Promise<StatusResponse> {
    try {
      return await invoke('status') as StatusResponse;
    } catch (error) {
      console.error('Failed to get VPN status:', error);
      throw new Error(`Status Error: ${error}`);
    }
  }

  static async connect(address: string): Promise<ConnectResponse> {
    try {
      return await invoke('connect', { address }) as ConnectResponse;
    } catch (error) {
      console.error('Failed to connect to VPN:', error);
      throw new Error(`Connect Error: ${error}`);
    }
  }

  static async disconnect(): Promise<DisconnectResponse> {
    try {
      return await invoke('disconnect') as DisconnectResponse;
    } catch (error) {
      console.error('Failed to disconnect from VPN:', error);
      throw new Error(`Disconnect Error: ${error}`);
    }
  }

  static getBestDestination(destinations: StatusResponse['available_destinations']): string | null {
    if (destinations.length === 0) return null;
    
    // Sort by address for consistent selection
    const sorted = [...destinations].sort((a, b) => a.address.localeCompare(b.address));
    return sorted[0].address;
  }

  static formatDestination(destination: StatusResponse['available_destinations'][0]): string {
    const country = destination.meta.country || 'Unknown';
    const city = destination.meta.city || '';
    return city ? `${country} - ${city}` : country;
  }
}