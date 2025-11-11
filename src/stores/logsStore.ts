import { createStore, type Store } from "solid-js/store";
import { type StatusResponse } from "@src/services/vpnService.ts";
import { formatDestination } from "@src/utils/destinations.ts";
import { getEthAddress } from "@src/utils/address";
import { shortAddress } from "@src/utils/shortAddress";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface LogsState {
  logs: LogEntry[];
}

type LogsActions = {
  append: (message: string) => void;
  appendStatus: (response: StatusResponse) => void;
  clear: () => void;
};

type LogsStoreTuple = readonly [Store<LogsState>, LogsActions];

export type LogEntry = { date: string; message: string };

export function createLogsStore(): LogsStoreTuple {
  const [state, setState] = createStore<LogsState>({ logs: [] });
  const isMainWindow = getCurrentWindow().label === "main";

  function buildStatusLog(args: { response?: StatusResponse; error?: string }): string | undefined {
    const lastMessage = state.logs.length ? state.logs[state.logs.length - 1].message : undefined;
    return buildLogContent(args, lastMessage);
  }

  function buildLogContent(
    args: {
      response?: StatusResponse;
      error?: string;
    },
    lastMessage?: string,
  ): string | undefined {
    let content: string | undefined;
    if (args.response) {
      const rm = args.response.run_mode;
      // Check connection state from destinations (connection info is in DestinationState, not RunMode)
      const connectedDest = args.response.destinations.find(
        ds => typeof ds.connection_state === "object" && "Connected" in ds.connection_state,
      );
      const connectingDest = args.response.destinations.find(
        ds => typeof ds.connection_state === "object" && "Connecting" in ds.connection_state,
      );
      const disconnectingDest = args.response.destinations.find(
        ds => typeof ds.connection_state === "object" && "Disconnecting" in ds.connection_state,
      );

      if (connectedDest) {
        const destination = connectedDest.destination;
        const where = formatDestination(destination);
        content = `Connected: ${where} - ${shortAddress(getEthAddress(destination.address))}`;
      } else if (connectingDest) {
        const destination = connectingDest.destination;
        const where = formatDestination(destination);
        content = `Connecting: ${where} - ${shortAddress(getEthAddress(destination.address))}`;
      } else if (disconnectingDest) {
        const destination = disconnectingDest.destination;
        const where = formatDestination(destination);
        content = `Disconnecting: ${where} - ${shortAddress(getEthAddress(destination.address))}`;
      } else if (typeof rm === "object" && "Running" in rm) {
        // Running but no active connection
        const lastWasDisconnected = Boolean(lastMessage && lastMessage.startsWith("Disconnected"));
        if (!lastWasDisconnected) {
          const lines = args.response.destinations.map(ds => {
            const d = ds.destination;
            const where = formatDestination(d);
            return `- ${where} - ${shortAddress(getEthAddress(d.address))}`;
          });
          content = `Disconnected. Available:\n${lines.join("\n")}`;
        }
      } else if (typeof rm === "object" && "PreparingSafe" in rm) {
        content = "PreparingSafe";
      } else if (rm === "Warmup") {
        content = "Warmup";
      } else if (rm === "Shutdown") {
        content = "Shutdown";
      } else {
        const destinations = args.response.destinations.length;
        content = `status: Unknown, destinations: ${destinations}`;
      }
    } else if (args.error) {
      content = `${args.error}`;
    }
    return content;
  }

  const actions = {
    append: (message: string) => {
      const lastMessage = state.logs.length ? state.logs[state.logs.length - 1].message : "";
      if (lastMessage === message) return;
      const entry: LogEntry = { date: new Date().toISOString(), message };
      setState("logs", existing => [...existing, entry]);
      // Broadcast to other windows only from main window to avoid echo loops
      if (isMainWindow) void emit("logs:append", entry);
    },

    appendStatus: (response: StatusResponse) => {
      const maybe = buildStatusLog({ response });
      if (maybe) actions.append(maybe);
    },

    clear: () => setState("logs", []),
  };

  // Cross-window synchronization
  void listen<LogEntry>("logs:append", ({ payload }) => {
    // Ignore if duplicate of last (idempotent)
    const last = state.logs.length ? state.logs[state.logs.length - 1] : undefined;
    if (last && last.date === payload.date && last.message === payload.message) return;
    setState("logs", existing => [...existing, payload]);
  });

  if (isMainWindow) {
    // Respond to snapshot requests from other windows
    void listen("logs:request-snapshot", () => {
      void emit("logs:snapshot", state.logs);
    });
  }

  // Accept snapshot to hydrate fresh windows
  void listen<LogEntry[]>("logs:snapshot", ({ payload }) => {
    setState("logs", Array.isArray(payload) ? payload : []);
  });

  return [state, actions] as const;
}

const logsStore = createLogsStore();

export function useLogsStore(): LogsStoreTuple {
  return logsStore;
}
