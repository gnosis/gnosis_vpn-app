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
      setState("logs", existing => {
        const lastMessage = existing.length ? existing[existing.length - 1].message : "";
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
