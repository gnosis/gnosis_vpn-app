import { createSignal } from "solid-js";
import { isSelectable, rankContext } from "../utils/destinations.ts";
import { useAppStore } from "./appStore.ts";
import { useSettingsStore } from "./settingsStore.ts";

export interface ExitCostRequest {
  id: string;
  // connected: the card keeps the tunnel's exit and shows this one's cost below it
  switching: boolean;
  // whose pick the switch is; a plain connect leaves it to the mode it starts from
  auto?: boolean;
}

// Module scope like the stores it gates: Connect, the exit list and the card share it.
const [exitCost, setExitCost] = createSignal<ExitCostRequest | null>(null);

/** The connect or switch waiting on its data cost; null when none is. */
export { exitCost };

/** The exit a request waits on, or null. */
export const exitCostFor = (): string | null => exitCost()?.id ?? null;

/** Connects or switches to `id`; until a connect has ever succeeded, first shows what it sets aside. */
export function requestConnect(
  id: string,
  options: { switching?: boolean; auto?: boolean } = {},
): void {
  const [settings] = useSettingsStore();
  if (!settings.hasConnected) {
    useAppStore()[1].exitCostOpened();
    setExitCost({
      id,
      switching: options.switching ?? false,
      auto: options.auto,
    });
    return;
  }
  void useAppStore()[1].connect(id, options.auto);
}

/** Whether the exit a request waits on still takes a connection; it can fill or lose its route while the view shows. */
export function exitCostUsable(): boolean {
  const request = exitCost();
  if (request === null) return false;
  const [appState] = useAppStore();
  return isSelectable(appState.destinations[request.id], rankContext(appState));
}

/** The cost view's Connect or Switch. */
export function confirmExitCost(): void {
  const request = exitCost();
  if (request === null || !exitCostUsable()) return;
  setExitCost(null);
  useAppStore()[1].exitCostClosed();
  void useAppStore()[1].connect(request.id, request.auto);
}

export function cancelExitCost(): void {
  if (exitCost() === null) return;
  setExitCost(null);
  useAppStore()[1].exitCostClosed();
}
