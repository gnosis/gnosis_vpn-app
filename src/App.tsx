import { createSignal } from "solid-js";
import logo from "./assets/logo.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
    const [msg, setMsg] = createSignal("");
  const [peers, setPeers] = createSignal([]);

  async function status() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    let res: any;
    try {
    res = await invoke("status") ;
    if ("Status" in res) {
        const st = res["Status"];
        if ("available_destinations" in st) {
            const availableDestinations = st["available_destinations"];
            console.log("Available Destinations:", availableDestinations);
            setPeers(availableDestinations);
        }
    }
    res = JSON.stringify(res, null, 2);
    } catch (error) {
        res = `Error: ${error}`;
    }
    const msg = `Status: ${res}`;
    setMsg(msg);
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
