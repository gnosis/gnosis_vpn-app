import { createStore, type Store } from "solid-js/store";
import { type StatusResponse } from "@src/services/vpnService.ts";
import { formatDestination } from "@src/utils/destinations.ts";
import { getEthAddress } from "@src/utils/address";
import { shortAddress } from "@src/utils/shortAddress";

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
      const rm = args.response.run_mode;
      if ("Running" in rm) {
        const connection = rm.Running.connection;
        if (typeof connection === "object") {
          if ("Connected" in connection) {
            const destination = connection.Connected;
            const where = formatDestination(destination);
            content = `Connected: ${where} - ${
              shortAddress(getEthAddress(destination.address))
            }`;
          } else if ("Connecting" in connection) {
            const destination = connection.Connecting;
            const where = formatDestination(destination);
            content = `Connecting: ${where} - ${
              shortAddress(getEthAddress(destination.address))
            }`;
          } else if ("Disconnecting" in connection) {
            const destination = connection.Disconnecting;
            const where = formatDestination(destination);
            content = `Disconnecting: ${where} - ${
              shortAddress(getEthAddress(destination.address))
            }`;
          }
        } else if (connection === "Disconnected") {
          const lastWasDisconnected = Boolean(
            lastMessage && lastMessage.startsWith("Disconnected"),
          );
          if (!lastWasDisconnected) {
            const lines = args.response.available_destinations.map((d) => {
              const where = formatDestination(d);
              return `- ${where} - ${shortAddress(getEthAddress(d.address))}`;
            });
            content = `Disconnected. Available:\n${lines.join("\n")}`;
          }
        } else {
          const destinations = args.response.available_destinations.length;
          content = `status: ${connection}, destinations: ${destinations}`;
        }
      } else if ("PreparingSafe" in rm) {
        content = "PreparingSafe";
      } else if ("Warmup" in rm) {
        const progress = rm.Warmup.sync_progress;
        content = `Warmup: ${progress.toFixed(2)}`;
      } else {
        const destinations = args.response.available_destinations.length;
        content = `status: Unknown, destinations: ${destinations}`;
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
