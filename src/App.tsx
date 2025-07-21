import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface StatusResponse {
  wireguard: WireGuardStatus;
  status: Status;
  available_destinations: Destination[];
}

type ConnectResponse = { Connecting: Destination } | "AddressNotFound";
type DisconnectResponse = { Disconnecting: Destination } | "NotConnected";

type WireGuardStatus = "Up" | "Down" | "ManuallyManaged";

type Status =
  | { Connecting: Destination }
  | { Disconnecting: Destination }
  | { Connected: Destination }
  | "Disconnected";

interface Destination {
  meta: Record<string, string>; // equivalent to HashMap<String, String>
  address: string; // Address as a string (assumption)
  path: Path;
}

type Path = { Hops: number } | { IntermediatePath: string[] };

function App() {
  const [msg, setMsg] = createSignal("");
  const [peers, setPeers] = createSignal<Destination[]>([]);
  const [connected, setConnected] = createSignal<Destination>();

  async function status() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    try {
      const res: StatusResponse = (await invoke("status")) as StatusResponse;
      const peers = res.available_destinations;
      peers.sort((a, b) => a.address.localeCompare(b.address));
      setPeers(peers);
      console.log("Status Response:", res);
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
      setMsg(`Status Error: ${error}`);
    }
  }

  async function connect(address: string) {
    try {
      const res: ConnectResponse = (await invoke("connect", {
        address,
      })) as ConnectResponse;
      setMsg(JSON.stringify(res, null, 2));
      setTimeout(() => status(), 333);
    } catch (error) {
      setMsg(`Connect Error: ${error}`);
    }
  }

  async function disconnect() {
    try {
      const res: DisconnectResponse = (await invoke(
        "disconnect",
      )) as DisconnectResponse;
      setMsg(JSON.stringify(res, null, 2));
      setTimeout(() => status(), 333);
    } catch (error) {
      setMsg(`Disconnect Error: ${error}`);
    }
  }

  onMount(status);

  return (
    <main class="container">
      <p>Gnosis VPN</p>
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

function isConnected(status: Status): status is { Connected: Destination } {
  return typeof status === "object" && "Connected" in status;
}

function isConnecting(status: Status): status is { Connecting: Destination } {
  return typeof status === "object" && "Connecting" in status;
}

function isDisconnecting(
  status: Status,
): status is { Disconnecting: Destination } {
  return typeof status === "object" && "Disconnecting" in status;
}

export default App;
