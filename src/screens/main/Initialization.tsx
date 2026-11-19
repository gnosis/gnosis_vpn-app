import type { StartupIssue } from "@src/services/vpnService.ts";
import Spinner from "@src/components/common/Spinner.tsx";
import GnosisVpnLogo from "@src/components/common/GnosisVpnLogo.tsx";
import StartupIssueBanner from "@src/components/StartupIssueBanner.tsx";

interface InitializationProps {
  error?: string;
  recoveryReason?: StartupIssue | null;
}

export default function Initialization(props: InitializationProps) {
  return (
    <div class="relative h-full w-full text-center">
      {/* Logo geometry mirrors the splash in index.html so the mount handoff is seamless. */}
      <div class="absolute inset-x-0 top-[var(--golden-logo-y)] -translate-y-1/2 px-6">
        <GnosisVpnLogo class="mx-auto h-12 w-auto text-logo-ink" />
      </div>

      <div class="absolute inset-x-0 top-[var(--golden-content-y)] flex flex-col items-center px-8 transition-opacity duration-300 ease-out starting:opacity-0">
        {props.error
          ? (
            <div class="text-status-error">
              <p class="mb-2 font-bold">Critical error during initialization</p>
              <p class="text-sm">{props.error}</p>
            </div>
          )
          : (
            <div class="flex flex-col items-center">
              <Spinner class="mb-4 h-8 w-8 text-brand-primary" />
              <p class="text-text-secondary">Running startup tasks</p>
              <div class="mt-4">
                <StartupIssueBanner issue={props.recoveryReason} />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
