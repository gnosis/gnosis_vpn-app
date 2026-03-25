import { createStore, type Store } from "solid-js/store";
import {
  formatWarmupStatus,
  isPreparingSafeRunMode,
  isWarmupRunMode,
  SerializedSinceTime,
  type StatusResponse,
} from "@src/services/vpnService.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import { shortAddress } from "../utils/shortAddress.ts";
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

type LogsStoreTuple = readonly [Store<LogsState>, LogsActions, () => void];

export type LogEntry = { date: string; message: string };

export function createLogsStore(): LogsStoreTuple {
  const [state, setState] = createStore<LogsState>({ logs: [] });
  const isMainWindow = getCurrentWindow().label === "main";

  function buildStatusLog(args: {
    response?: StatusResponse;
    error?: string;
  }): string | undefined {
    const lastMessage = state.logs.length
      ? state.logs[state.logs.length - 1].message
      : undefined;
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
      const dests = Object.values(args.response.destinations);
      // Check connection state from destinations (connection info is in DestinationState, not RunMode)
      const connectedDest = dests.find(
        (ds) =>
          typeof ds.connection_state === "object" &&
          "Connected" in ds.connection_state,
      );
      const connectingDest = dests.find(
        (ds) =>
          typeof ds.connection_state === "object" &&
          "Connecting" in ds.connection_state,
      );
      const disconnectingDest = dests.find(
        (ds) =>
          typeof ds.connection_state === "object" &&
          "Disconnecting" in ds.connection_state,
      );

      if (connectedDest) {
        const destination = connectedDest.destination;
        const where = destinationLabel(destination);
        content = `Connected: ${where} - ${shortAddress(destination.address)}`;
      } else if (connectingDest) {
        const destination = connectingDest.destination;
        const where = destinationLabel(destination);
        const phase = typeof connectingDest.connection_state === "object" &&
            "Connecting" in connectingDest.connection_state
          ? (
            connectingDest.connection_state as {
              Connecting: [SerializedSinceTime, string];
            }
          ).Connecting[1]
          : undefined;
        const phaseSuffix = phase ? ` - ${phase}` : "";
        content = `Connecting: ${where} - ${
          shortAddress(
            destination.address,
          )
        }${phaseSuffix}`;
      } else if (disconnectingDest) {
        const destination = disconnectingDest.destination;
        const where = destinationLabel(destination);
        const phase = typeof disconnectingDest.connection_state === "object" &&
            "Disconnecting" in disconnectingDest.connection_state
          ? (
            disconnectingDest.connection_state as {
              Disconnecting: [SerializedSinceTime, string];
            }
          ).Disconnecting[1]
          : undefined;
        const phaseSuffix = phase ? ` - ${phase}` : "";
        content = `Disconnecting: ${where} - ${
          shortAddress(
            destination.address,
          )
        }${phaseSuffix}`;
      } else if (typeof rm === "object" && "Running" in rm) {
        // Running but no active connection
        const lastWasDisconnected = Boolean(
          lastMessage && lastMessage.startsWith("Disconnected"),
        );
        if (!lastWasDisconnected) {
          const lines = dests.map((ds) => {
            const d = ds.destination;
            const where = destinationLabel(d);
            return `- ${where} - ${shortAddress(d.address)}`;
          });
          content = `Disconnected. Available:\n${lines.join("\n")}`;
        }
      } else if (isPreparingSafeRunMode(rm)) {
        const addr = (rm as { PreparingSafe: { node_address: unknown } })
          .PreparingSafe.node_address;
        let isUnknown = false;
        if (typeof addr === "string") {
          const s = addr.trim().toLowerCase();
          isUnknown = s.length === 0 || s === "unknown";
        } else if (Array.isArray(addr)) {
          isUnknown = addr.length === 0;
        }
        if (isUnknown) {
          content = "Waiting for node address";
        }
      } else if (rm === "Shutdown") {
        content = "Shutdown";
      } else if (isWarmupRunMode(rm)) {
        content = `Warmup: ${formatWarmupStatus(rm.Warmup.status)}`;
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
      const lastMessage = state.logs.length
        ? state.logs[state.logs.length - 1].message
        : "";
      if (lastMessage === message) return;
      const entry: LogEntry = { date: new Date().toISOString(), message };
      setState("logs", (existing) => [...existing, entry]);
      // Broadcast to other windows only from main window to avoid echo loops
      if (isMainWindow) void emit("logs:append", entry);
    },

    appendStatus: (response: StatusResponse) => {
      const maybe = buildStatusLog({ response });
      if (maybe) actions.append(maybe);
    },

    clear: () => setState("logs", []),
  };

  const unlisteners: (() => void)[] = [];

  listen<LogEntry>("logs:append", ({ payload }) => {
    const last = state.logs.length
      ? state.logs[state.logs.length - 1]
      : undefined;
    if (
      last &&
      last.date === payload.date &&
      last.message === payload.message
    ) {
      return;
    }
    setState("logs", (existing) => [...existing, payload]);
  })
    .then((u) => unlisteners.push(u))
    .catch((e) => console.error("logs:append listener failed", e));

  if (isMainWindow) {
    listen("logs:request-snapshot", () => {
      void emit("logs:snapshot", state.logs);
    })
      .then((u) => unlisteners.push(u))
      .catch((e) => console.error("logs:request-snapshot listener failed", e));
  }

  listen<LogEntry[]>("logs:snapshot", ({ payload }) => {
    setState("logs", Array.isArray(payload) ? payload : []);
  })
    .then((u) => unlisteners.push(u))
    .catch((e) => console.error("logs:snapshot listener failed", e));

  const dispose = () => {
    for (const unlisten of unlisteners) unlisten();
    unlisteners.length = 0;
  };

  return [state, actions, dispose] as const;
}

const logsStore = createLogsStore();

export function useLogsStore(): LogsStoreTuple {
  return logsStore;
}
