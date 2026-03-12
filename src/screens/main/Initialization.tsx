import { ServiceInfo } from "../../services/vpnService.ts";
import { Spinner } from "../../components/common/Spinner.tsx";

interface InitializationProps {
  info: ServiceInfo | null;
  error?: string;
}

export default function Initialization(props: InitializationProps) {
  return (
    <div class="flex h-full w-full flex-col items-center justify-center p-8 text-center">
      <h1 class="mb-4 text-2xl font-bold text-text-primary">GnosisVPN</h1>

      {props.error
        ? (
          <div class="text-status-error">
            <p class="mb-2 font-bold">Failed to reach background service</p>
            <p class="text-sm">{props.error}</p>
          </div>
        )
        : (
          <div class="flex flex-col items-center">
            <Spinner class="mb-4 h-8 w-8 text-brand-primary" />
            <p class="text-text-secondary">Checking compatibility...</p>
            {props.info && (
              <p class="mt-2 text-xs text-text-tertiary">
                Service Version: {props.info.version}
              </p>
            )}
          </div>
        )}
    </div>
  );
}
