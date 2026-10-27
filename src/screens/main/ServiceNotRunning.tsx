import { createResource, createSignal, For, Show } from "solid-js";
import { VPNService } from "@src/services/vpnService.ts";
import { logError, logInfo } from "@src/utils/appLog.ts";
import Button from "@src/components/common/Button.tsx";
import CopyBlock from "@src/components/common/CopyBlock.tsx";
import GnosisVpnLogo from "@src/components/common/GnosisVpnLogo.tsx";

/** Daemon socket absent (installed, not started); the init loop keeps retrying, so this leaves by itself. */
export default function ServiceNotRunning() {
  const [info] = createResource(() => VPNService.serviceNotRunningInfo());
  const [starting, setStarting] = createSignal(false);
  const [startError, setStartError] = createSignal<string | null>(null);

  const startService = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await VPNService.startService();
      logInfo("Service start requested");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError(`Service start failed: ${message}`);
      setStartError(message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div class="h-full w-full flex flex-col p-6 gap-4 overflow-y-auto text-text-primary">
      <GnosisVpnLogo class="w-2/3 self-center text-text-primary" />
      <h1 class="text-2xl font-bold">Gnosis VPN service is not running</h1>
      <p class="text-sm text-text-secondary">
        If this follows an upgrade, the installer may have stopped the service
        after a failed identity migration; see the installer log.
      </p>
      <Show when={info()}>
        {(details) => (
          <>
            <ul class="text-xs font-mono text-text-secondary break-all">
              <For each={details().migrate_log_paths}>
                {(path) => <li>{path}</li>}
              </For>
            </ul>
            <Show
              when={details().migrate_commands}
              fallback={
                <>
                  <Show when={details().can_start_from_app}>
                    <Button
                      size="lg"
                      onClick={() => void startService()}
                      loading={starting()}
                    >
                      Start service
                    </Button>
                    <Show when={startError()}>
                      {(message) => (
                        <p class="text-sm text-vpn-red">{message()}</p>
                      )}
                    </Show>
                  </Show>
                  <p class="text-sm text-text-secondary">
                    {details().can_start_from_app
                      ? "Or run this in Terminal:"
                      : "Start it from a terminal:"}
                  </p>
                  <CopyBlock
                    text={details().start_command}
                    label="start command"
                  />
                </>
              }
            >
              {(commands) => (
                <>
                  {/* No Start button: starting now would mint a fresh identity and turn the retry into a conflict. */}
                  <p class="text-sm text-text-secondary">
                    The previous identity has not been migrated yet. Run one of
                    these in a terminal.
                  </p>
                  <p class="text-sm text-text-secondary">
                    Migrate the previous identity (recommended):
                  </p>
                  <CopyBlock
                    text={commands().identity}
                    label="identity migration command"
                  />
                  <p class="text-sm text-text-secondary">
                    Or set the previous identity aside and start with a new one:
                  </p>
                  <CopyBlock
                    text={commands().start_clean}
                    label="start-clean command"
                  />
                  <p class="text-sm text-text-secondary">
                    Stuck? Send the migration log to support. This only shares
                    diagnostics and fixes nothing:
                  </p>
                  <CopyBlock
                    text={commands().upload_log}
                    label="upload log command"
                  />
                  <p class="text-sm text-text-secondary">
                    Start the service only after the migration succeeded or you
                    chose a new identity:
                  </p>
                  <CopyBlock
                    text={details().start_command}
                    label="start command"
                  />
                </>
              )}
            </Show>
          </>
        )}
      </Show>
      <p class="mt-auto text-center text-xs text-text-secondary">
        Checking again every few seconds
      </p>
    </div>
  );
}
