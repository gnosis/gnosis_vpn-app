import { type Destination, type Status } from '../services/vpnService';
import { formatDestination } from '../utils/destinations';

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

export function buildLogContent(
  args: {
    response?: import('../services/vpnService').StatusResponse;
    error?: string;
  },
  lastMessage?: string
): string | undefined {
  let content: string | undefined;
  if (args.response) {
    const statusValue = args.response.status;
    if (isConnected(statusValue)) {
      const destination = statusValue.Connected;
      const where = formatDestination(destination);
      content = `Connected: ${where} - ${destination.address}`;
    } else if (isConnecting(statusValue)) {
      const destination = statusValue.Connecting;
      const where = formatDestination(destination);
      content = `Connecting: ${where} - ${destination.address}`;
    } else if (isDisconnected(statusValue)) {
      const lastWasDisconnected = Boolean(
        lastMessage && lastMessage.startsWith('Disconnected')
      );
      if (lastWasDisconnected) {
        content = undefined;
      } else {
        const lines = args.response.available_destinations.map(d => {
          const where = formatDestination(d);
          return `- ${where} - ${d.address}`;
        });
        content = `Disconnected. Available:\n${lines.join('\n')}`;
      }
    } else {
      const statusLabel =
        typeof statusValue === 'string'
          ? statusValue
          : Object.keys(statusValue)[0] || 'Unknown';
      const destinations = args.response.available_destinations.length;
      content = `status: ${statusLabel}, destinations: ${destinations}`;
    }
  } else if (args.error) {
    content = `${args.error}`;
  }
  return content;
}

export type LogEntry = { date: string; message: string };

export function buildStatusLog(
  prevLogs: LogEntry[],
  args: {
    response?: import('../services/vpnService').StatusResponse;
    error?: string;
  }
): string | undefined {
  const lastMessage = prevLogs.length
    ? prevLogs[prevLogs.length - 1].message
    : undefined;
  return buildLogContent(args, lastMessage);
}
