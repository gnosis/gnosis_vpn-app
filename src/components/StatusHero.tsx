import { Show } from "solid-js";
import { isConnected, isConnecting, isDisconnecting } from "../utils/status.ts";
import { useAppStore } from "../stores/appStore.ts";
import Spinner from "./Spinner.tsx";
import connectedImg from "../assets/img/connected.svg";
import disconnectedImg from "../assets/img/disconnected.svg";

export function StatusHero() {
  const [appState] = useAppStore();

  const isBusy = () => isConnecting(appState.connectionStatus) || isDisconnecting(appState.connectionStatus);
  const isOffline = () =>
    !isConnected(appState.connectionStatus) &&
    !isConnecting(appState.connectionStatus) &&
    !isDisconnecting(appState.connectionStatus);

  return (
    <div class="w-full h-1/3 flex flex-col items-center justify-center gap-3">
      <div class="h-24 flex items-center justify-center">
        <Show when={isBusy()}>
          <Spinner />
        </Show>
        <Show when={isConnected(appState.connectionStatus)}>
          <img src={connectedImg} alt="Connected" class="h-24" />
        </Show>
        <Show when={isOffline()}>
          <img src={disconnectedImg} alt="Disconnected" class="h-24" />
        </Show>
      </div>
    </div>
  );
}

export default StatusHero;
