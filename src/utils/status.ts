import { type Destination, type Status } from '../services/vpnService';

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
    const statusValue = args.response.status as unknown;
    if (typeof statusValue === 'object' && statusValue !== null) {
      if (
        'Connected' in (statusValue as Record<string, unknown>) ||
        'Connecting' in (statusValue as Record<string, unknown>)
      ) {
        const isConnected =
          'Connected' in (statusValue as Record<string, unknown>);
        const destination = (statusValue as any)[
          isConnected ? 'Connected' : 'Connecting'
        ] as import('../services/vpnService').Destination;
        const city = destination.meta?.city || '';
        const location = destination.meta?.location || '';
        const where = [city, location].filter(Boolean).join(', ');
        content = `${isConnected ? 'Connected' : 'Connecting'}: ${where} - ${
          destination.address
        }`;
      }
    } else if (statusValue === 'Disconnected') {
      const lastWasDisconnected = Boolean(
        lastMessage && lastMessage.startsWith('Disconnected')
      );
      if (lastWasDisconnected) {
        content = undefined;
      } else {
        const lines = args.response.available_destinations.map(d => {
          const city = d.meta?.city || '';
          const location = d.meta?.location || '';
          const where = [city, location].filter(Boolean).join(', ');
          return `- ${where} - ${d.address}`;
        });
        content = `Disconnected. Available:\n${lines.join('\n')}`;
      }
    } else {
      const statusLabel = args.response.status as string;
      const destinations = args.response.available_destinations.length;
      content = `status: ${statusLabel}, destinations: ${destinations}`;
    }
  } else if (args.error) {
    content = `${args.error}`;
  }
  return content;
}
