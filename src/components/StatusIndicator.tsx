import { createMemo } from 'solid-js';
import {
  isConnected,
  isConnecting,
  isDisconnecting,
  type Status,
} from '../types';

export function StatusIndicator(props: {
  status: Status;
  isLoading?: boolean;
}) {
  const statusText = createMemo(() => {
    if (props.isLoading) return 'Loading...';
    if (isConnected(props.status)) return 'Connected';
    if (isConnecting(props.status)) return 'Connecting...';
    if (isDisconnecting(props.status)) return 'Disconnecting...';
    return 'Disconnected';
  });

  const statusClass = createMemo(() => {
    if (props.isLoading || isConnecting(props.status))
      return 'status-dot status-dot-connecting';
    if (isConnected(props.status)) return 'status-dot status-dot-connected';
    if (isDisconnecting(props.status))
      return 'status-dot status-dot-connecting';
    return 'status-dot status-dot-disconnected';
  });

  return (
    <div class="flex flex-col items-center space-y-4">
      <div class={statusClass()} />
      <p class="text-lg font-medium">{statusText()}</p>
    </div>
  );
}

export default StatusIndicator;
