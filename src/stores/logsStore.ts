import { createStore, type Store } from "solid-js/store";
import {
  formatWarmupStatus,
  isPreparingSafeRunMode,
  isWarmupRunMode,
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
      const { connected, connecting, disconnecting } = args.response;

      if (connected) {
        const dest = args.response.destinations[connected]?.destination;
        const where = dest ? destinationLabel(dest) : connected;
        const addr = dest ? shortAddress(dest.address) : "";
        content = `Connected: ${where} - ${addr}`;
      } else if (connecting) {
        const dest =
          args.response.destinations[connecting.destination_id]?.destination;
        const where = dest ? destinationLabel(dest) : connecting.destination_id;
        const addr = dest ? shortAddress(dest.address) : "";
        content = `Connecting: ${where} - ${addr} - ${connecting.phase}`;
      } else if (disconnecting.length > 0) {
        const d = disconnecting[0];
        const dest = args.response.destinations[d.destination_id]?.destination;
        const where = dest ? destinationLabel(dest) : d.destination_id;
        const addr = dest ? shortAddress(dest.address) : "";
        content = `Disconnecting: ${where} - ${addr} - ${d.phase}`;
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
        const destinationCount = Object.keys(args.response.destinations).length;
        content = `status: Unknown, destinations: ${destinationCount}`;
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
