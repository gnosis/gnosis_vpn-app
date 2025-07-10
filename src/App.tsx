import { createSignal } from "solid-js";
import logo from "./assets/logo.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";


// ----- Response enum -----
type Response =
  | { Status: StatusResponse }
  | { Connect: ConnectResponse }
  | { Disconnect: DisconnectResponse }
  | "Pong";

// response to
interface StatusResponse {
  wireguard: WireGuardStatus;
  status: Status;
  available_destinations: Destination[];
}

type WireGuardStatus = "Up" | "Down" | "ManuallyManaged";

type Status =
  | { Connecting: Destination }
  | { Disconnecting: Destination }
  | { Connected: Destination }
  | "Disconnected";

type ConnectResponse =
  | { Connecting: Destination }
  | "PeerIdNotFound";

type DisconnectResponse =
  | { Disconnecting: Destination }
  | "NotConnected";

interface Destination {
  meta: Record<string, string>; // equivalent to HashMap<String, String>
  peer_id: string;              // PeerId as a string (assumption)
  path: Path;
}

type Path =
  | { Hops: number }
  | { IntermediatePath: string[] };

function App() {
    const [msg, setMsg] = createSignal("");
  const [peers, setPeers] = createSignal<Destination[]>();

  async function status() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    try {
        const res: StatusResponse = await invoke("status") as StatusResponse;
            setPeers(res.available_destinations);
            setMsg(`Status: ${JSON.stringify(res, null, 2)}`);
        } catch (error) {
        setMsg(`Status Error: ${error}`);
    }
  }

  async function connect(peerId: string) {
    let res: any;
    try {
    res = await invoke("connect", { peerId });
    res = JSON.stringify(res, null, 2);
    } catch (error) {
        res = `Error: ${error}`;
    }
    const msg = `Connect: ${res}`;
    setMsg(msg);
  }

  return (
    <main class="container">
    <p>Gnosis VPN</p>
    <button type="button" onClick={status} >Status</button>
      <p>{msg()}</p>
      {peers().map((dest: any) => (
          <div>
        <p>
          {JSON.stringify(dest.meta, null, 2)}
        </p>
        <button type="button" onClick={() => connect(dest.peer_id)} >
            Connect
        </button>
        </div>
      ))}
    </main>
  );
}

export default App;
