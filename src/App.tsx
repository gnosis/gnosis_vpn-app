import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface StatusResponse {
  wireguard: WireGuardStatus;
  status: Status;
  available_destinations: Destination[];
}

type ConnectResponse = { Connecting: Destination } | "PeerIdNotFound";
type DisconnectResponse = { Disconnecting: Destination } | "NotConnected";

type WireGuardStatus = "Up" | "Down" | "ManuallyManaged";

type Status =
  | { Connecting: Destination }
  | { Disconnecting: Destination }
  | { Connected: Destination }
  | "Disconnected";

interface Destination {
  meta: Record<string, string>; // equivalent to HashMap<String, String>
  peer_id: string; // PeerId as a string (assumption)
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
      setPeers(res.available_destinations);
      if (isConnected(res.status)) {
        setConnected(res.status.Connected);
      } else if (isConnecting(res.status)) {
        setConnected(res.status.Connecting);
        setTimeout(() => status(), 1000);
      } else if (isDisonnecting(res.status)) {
        setConnected(undefined);
        setTimeout(() => status(), 1000);
      } else {
        setConnected(undefined);
      }
      setMsg(JSON.stringify(res, null, 2));
    } catch (error) {
      setMsg(`Status Error: ${error}`);
    }
  }

  async function connect(peerId: string) {
    try {
      const res: ConnectResponse = (await invoke("connect", {
        peerId,
      })) as ConnectResponse;
      setMsg(`Connect: ${JSON.stringify(res, null, 2)}`);
      setTimeout(() => status(), 1000);
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
      setTimeout(() => status(), 1000);
    } catch (error) {
      setMsg(`Disconnect Error: ${error}`);
    }
  }

  const conn = connected();
  return (
    <main class="container">
      <p>Gnosis VPN</p>
      <button type="button" onClick={status}>
        Status
      </button>
      <p>{msg()}</p>
      {peers().map((dest: Destination) => (
        <div>
          <p>
            {JSON.stringify(dest.meta, null, 2)}
            <button type="button" onClick={() => connect(dest.peer_id)}>
              Connect
            </button>
          </p>
        </div>
      ))}
      {conn ? (
        <div>
          <p>Connected to: {JSON.stringify(conn.meta, null, 2)}</p>
          <p>Path: {JSON.stringify(conn.path, null, 2)}</p>
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      ) : (
        <p>No active connection</p>
      )}
    </main>
  );
}

function isConnected(status: Status): status is { Connected: Destination } {
  return typeof status === "object" && "Connected" in status;
}

function isConnecting(status: Status): status is { Connecting: Destination } {
  return typeof status === "object" && "Connecting" in status;
}

function isDisonnecting(
  status: Status,
): status is { Disconnecting: Destination } {
  return typeof status === "object" && "Disconnecting" in status;
}

export default App;
