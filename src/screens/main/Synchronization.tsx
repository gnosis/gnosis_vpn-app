import syncIcon from "@assets/icons/sync.svg";
import { useAppStore } from "@src/stores/appStore.ts";
import StatusIndicator from "../../components/StatusIndicator.tsx";
import { useLogsStore } from "../../stores/logsStore.ts";

export default function Synchronization() {
  const [state] = useAppStore();

  const [logsState] = useLogsStore();
  console.log("logsState", logsState.logs);

  return (
    <div class="h-full w-full flex flex-col items-center p-6 pb-0 select-none">
      <h1 class="w-full text-2xl font-bold text-center my-6">
        Initial Synchronization
      </h1>
      <img
        src={syncIcon}
        alt="Synchronization"
        class={`w-1/3 mb-8 ${
          state.vpnStatus === "ServiceUnavailable"
            ? "animate-pulse"
            : "animate-spin-tick"
        }`}
      />
      <div class="text-sm text-text-secondary">
        This can take up to 10 minutes
      </div>
      <div class="grow"></div>
      <StatusIndicator size="sm" />
    </div>
  );
}
