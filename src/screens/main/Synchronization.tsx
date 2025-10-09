import syncIcon from "@assets/icons/sync.svg";
import { useAppStore } from "@src/stores/appStore.ts";
import StatusIndicator from "@src/components/StatusIndicator";

export default function Synchronization() {
  const [state] = useAppStore();

  return (
    <div class="h-full w-full flex flex-col items-center p-6 pb-0">
      <h1 class="w-full text-2xl font-bold text-center my-6">Initial Synchronization</h1>
      <img
        src={syncIcon}
        alt="Synchronization"
        class={`w-1/3 mb-8 ${state.vpnStatus === "ServiceUnavailable" ? "animate-pulse" : "animate-spin-tick"}`}
      />
      {/* <div>{progressPct()}%</div> */}
      <div class="text-sm text-gray-500">This can take up to 10 minutes</div>
      <div class="flex-grow"></div>
      <StatusIndicator size="sm" />
    </div>
  );
}
