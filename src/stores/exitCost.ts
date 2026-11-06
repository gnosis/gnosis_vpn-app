import { createSignal } from "solid-js";
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

/** Connects or switches to `id`, or first shows what it sets aside while the user still wants to see that. */
export function requestConnect(
  id: string,
  options: { switching?: boolean; auto?: boolean } = {},
): void {
  const [settings] = useSettingsStore();
  if (settings.showExitCost) {
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

/** The cost view's Connect or Switch. */
export function confirmExitCost(): void {
  const request = exitCost();
  if (request === null) return;
  setExitCost(null);
  useAppStore()[1].exitCostClosed();
  void useAppStore()[1].connect(request.id, request.auto);
}

export function cancelExitCost(): void {
  if (exitCost() === null) return;
  setExitCost(null);
  useAppStore()[1].exitCostClosed();
}
