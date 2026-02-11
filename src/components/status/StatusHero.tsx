import { Show } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import SpinnerBig from "./SpinnerBig.tsx";
import connectedImg from "@assets/img/connected.svg";
import disconnectedImg from "@assets/img/disconnected.svg";

export function StatusHero() {
  const [appState] = useAppStore();

  const isBusy = () =>
    appState.vpnStatus === "Connecting" ||
    appState.vpnStatus === "Disconnecting";

  return (
    <div class="w-full h-1/3 flex flex-col items-center justify-center gap-3">
      <div class="h-24 flex items-center justify-center">
        <Show when={isBusy()}>
          <SpinnerBig />
        </Show>
        <Show when={appState.vpnStatus === "Connected"}>
          <img src={connectedImg} alt="Connected" class="h-24" />
        </Show>
        <Show when={appState.vpnStatus === "Disconnected" || !appState.runMode}>
          <img src={disconnectedImg} alt="Disconnected" class="h-24" />
        </Show>
      </div>
    </div>
  );
}

export default StatusHero;
