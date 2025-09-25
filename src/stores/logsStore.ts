import { createStore, type Store } from "solid-js/store";
import { buildStatusLog, type LogEntry } from "../utils/status.ts";
import { type StatusResponse } from "../services/vpnService.ts";

interface LogsState {
  logs: LogEntry[];
}

type LogsActions = {
  append: (message: string) => void;
  appendStatus: (response: StatusResponse) => void;
  clear: () => void;
};

type LogsStoreTuple = readonly [Store<LogsState>, LogsActions];

export function createLogsStore(): LogsStoreTuple {
  const [state, setState] = createStore<LogsState>({ logs: [] });

  const append = (message: string) => {
    setState("logs", existing => {
      const lastMessage = existing.length ? existing[existing.length - 1].message : "";
      if (lastMessage === message) return existing;
      const entry: LogEntry = { date: new Date().toISOString(), message };
      return [...existing, entry];
    });
  };

  const actions = {
    append,
    appendStatus: (response: StatusResponse) => {
      const maybe = buildStatusLog(state.logs, { response });
      if (maybe) append(maybe);
    },
    clear: () => setState("logs", []),
  } as const;

  return [state, actions] as const;
}

const logsStore = createLogsStore();

export function useLogsStore(): LogsStoreTuple {
  return logsStore;
}
