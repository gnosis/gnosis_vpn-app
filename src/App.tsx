import { createSignal, onMount } from 'solid-js';
import './App.css';
import { VPNService } from './services';
import type {
  StatusResponse,
  ConnectResponse,
  DisconnectResponse,
  Destination,
} from './services';
import { isConnected, isConnecting, isDisconnecting } from './types';

function App() {
  const [msg, setMsg] = createSignal('');
  const [peers, setPeers] = createSignal<Destination[]>([]);
  const [connected, setConnected] = createSignal<Destination>();

  async function status() {
    try {
      const res: StatusResponse = await VPNService.getStatus();
      const peers = res.available_destinations;
      peers.sort((a, b) => a.address.localeCompare(b.address));
      setPeers(peers);
      console.log('Status Response:', res);
      if (isConnected(res.status)) {
        setConnected(res.status.Connected);
      } else if (isConnecting(res.status)) {
        setConnected(res.status.Connecting);
        setTimeout(() => status(), 333);
      } else if (isDisconnecting(res.status)) {
        setConnected(undefined);
        setTimeout(() => status(), 333);
      } else {
        setConnected(undefined);
      }
      setMsg(JSON.stringify(res, null, 2));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : `Status Error: ${error}`);
    }
  }

  async function connect(address: string) {
    try {
      const res: ConnectResponse = await VPNService.connect(address);
      setMsg(JSON.stringify(res, null, 2));
      setTimeout(() => status(), 333);
    } catch (error) {
      setMsg(
        error instanceof Error ? error.message : `Connect Error: ${error}`
      );
    }
  }

  async function disconnect() {
    try {
      const res: DisconnectResponse = await VPNService.disconnect();
      setMsg(JSON.stringify(res, null, 2));
      setTimeout(() => status(), 333);
    } catch (error) {
      setMsg(
        error instanceof Error ? error.message : `Disconnect Error: ${error}`
      );
    }
  }

  onMount(status);

  return (
    <main class="container">
      <p class="text-2xl font-bold text-red-500">Gnosis VPN</p>
      {(() => {
        const conn = connected();
        if (conn) {
          return (
            <div>
              {peers().map((dest: Destination) => (
                <p>
                  {JSON.stringify(dest.meta, null, 2)}
                  {conn.address === dest.address ? (
                    <button type="button" onClick={() => disconnect()}>
                      Disconnect
                    </button>
                  ) : (
                    <button type="button" onClick={() => connect(dest.address)}>
                      Switch
                    </button>
                  )}
                </p>
              ))}
            </div>
          );
        }
        return (
          <div>
            {peers().map((dest: Destination) => (
              <p>
                {JSON.stringify(dest.meta, null, 2)}
                <button type="button" onClick={() => connect(dest.address)}>
                  Connect
                </button>
              </p>
            ))}
          </div>
        );
      })()}
      <button type="button" onClick={status}>
        Refresh Status
      </button>
      <p>{msg()}</p>
    </main>
  );
}

export default App;
