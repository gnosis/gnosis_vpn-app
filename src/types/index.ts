export interface StatusResponse {
  wireguard: WireGuardStatus;
  status: Status;
  available_destinations: Destination[];
}

export type ConnectResponse = { Connecting: Destination } | 'AddressNotFound';
export type DisconnectResponse =
  | { Disconnecting: Destination }
  | 'NotConnected';

export type WireGuardStatus = 'Up' | 'Down' | 'ManuallyManaged';

export type Status =
  | { Connecting: Destination }
  | { Disconnecting: Destination }
  | { Connected: Destination }
  | 'ServiceUnavailable'
  | 'Disconnected';

export interface Destination {
  meta: Record<string, string>;
  address: string;
  path: Path;
}

export type Path = { Hops: number } | { IntermediatePath: string[] };

// UI Types
export interface ButtonProps
  extends Omit<
    import('solid-js').JSX.ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'class' | 'className'
  > {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  class?: string;
  children: import('solid-js').JSX.Element;
}

export type AppScreen = 'main' | 'settings' | 'logs';

export interface AppState {
  currentScreen: AppScreen;
  connectionStatus: Status;
  availableDestinations: Destination[];
  isLoading: boolean;
  error?: string;
}
