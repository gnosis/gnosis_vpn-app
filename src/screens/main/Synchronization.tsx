import syncIcon from "@assets/icons/sync.svg";
import { useAppStore } from "@src/stores/appStore.ts";
import StatusIndicator from "../../components/StatusIndicator.tsx";
import { formatWarmupStatus, RunMode } from "../../services/vpnService.ts";

export default function Synchronization() {
  const [state] = useAppStore();

  return (
    <div class="h-full w-full flex flex-col items-center p-6 pb-0">
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
        {extractWarmup(state.runMode)}
      </div>
      <div class="grow"></div>
      <StatusIndicator size="sm" />
    </div>
  );
}

function extractWarmup(runMode: RunMode | null): string {
  console.log("runMode", runMode);
  if (runMode && typeof runMode === "object" && "Warmup" in runMode) {
    return formatWarmupStatus(runMode.Warmup.status);
  }
  return "Waiting for service";
}
