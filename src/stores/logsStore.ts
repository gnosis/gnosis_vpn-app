import { createStore, type Store } from "solid-js/store";
import {
  isConnected,
  isConnecting,
  isDisconnected,
  isDisconnecting,
} from "../utils/status.ts";
import { type StatusResponse } from "../services/vpnService.ts";
import { formatDestination } from "../utils/destinations.ts";

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

  function buildStatusLog(
    args: { response?: StatusResponse; error?: string },
  ): string | undefined {
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
      const statusValue = args.response.status;
      if (isConnected(statusValue)) {
        const destination = statusValue.Connected;
        const where = formatDestination(destination);
        content = `Connected: ${where} - ${destination.address}`;
      } else if (isConnecting(statusValue)) {
        const destination = statusValue.Connecting;
        const where = formatDestination(destination);
        content = `Connecting: ${where} - ${destination.address}`;
      } else if (isDisconnected(statusValue)) {
        const lastWasDisconnected = Boolean(
          lastMessage && lastMessage.startsWith("Disconnected"),
        );
        if (lastWasDisconnected) {
          content = undefined;
        } else {
          const lines = args.response.available_destinations.map((d) => {
            const where = formatDestination(d);
            return `- ${where} - ${d.address}`;
          });
          content = `Disconnected. Available:\n${lines.join("\n")}`;
        }
      } else if (isDisconnecting(statusValue)) {
        const destination = statusValue.Disconnecting;
        const where = formatDestination(destination);
        content = `Disconnecting: ${where} - ${destination.address}`;
      } else {
        const statusLabel = typeof statusValue === "string"
          ? statusValue
          : Object.keys(statusValue)[0] || "Unknown";
        const destinations = args.response.available_destinations.length;
        content = `status: ${statusLabel}, destinations: ${destinations}`;
      }
    } else if (args.error) {
      content = `${args.error}`;
    }
    return content;
  }

  const actions = {
    append: (message: string) => {
      setState("logs", (existing) => {
        const lastMessage = existing.length
          ? existing[existing.length - 1].message
          : "";
        if (lastMessage === message) return existing;
        const entry: LogEntry = { date: new Date().toISOString(), message };
        return [...existing, entry];
      });
    },

    appendStatus: (response: StatusResponse) => {
      const maybe = buildStatusLog({ response });
      if (maybe) actions.append(maybe);
    },

    clear: () => setState("logs", []),
  };

  return [state, actions] as const;
}

const logsStore = createLogsStore();

export function useLogsStore(): LogsStoreTuple {
  return logsStore;
}
