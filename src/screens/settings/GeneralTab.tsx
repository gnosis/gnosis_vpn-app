import { createSignal, For, Show } from "solid-js";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir, join } from "@tauri-apps/api/path";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  type UpdateChannel,
  useSettingsStore,
} from "@src/stores/settingsStore.ts";
import { VPNService } from "@src/services/vpnService.ts";
import {
  destinationLabel,
  destinationLabelById,
} from "@src/utils/destinations.ts";
import { endOfLifeMessage } from "@src/utils/updateAvailability.ts";
import { createDeadlineClock } from "@src/utils/deadlineClock.ts";
import { logBundleFileName } from "@src/utils/logBundle.ts";
import { logInfo } from "@src/utils/appLog.ts";
import { Dropdown } from "@src/components/common/Dropdown.tsx";
import { Modal } from "@src/components/common/Modal.tsx";
import { Markdown } from "@src/components/common/Markdown.tsx";
import HowToUpdateModal from "@src/components/common/HowToUpdateModal.tsx";
import CheckUpdateModal from "@src/components/CheckUpdateModal.tsx";
import InstallUpdateModal from "@src/components/InstallUpdateModal.tsx";
import ExportLogsModal from "@src/components/ExportLogsModal.tsx";
import UploadLogsModal from "@src/components/UploadLogsModal.tsx";
import BackIcon from "@src/components/icons/BackIcon.tsx";
import { ACTION_BUTTON } from "@src/components/exitNode/LocationRow.tsx";
import FeatureComing from "@src/components/settings/FeatureComing.tsx";
import Notice from "@src/components/settings/Notice.tsx";
import {
  SettingsCard,
  SettingsHeading,
} from "@src/components/settings/SettingsGroup.tsx";
import SettingsRow, {
  ROW_BUTTON,
} from "@src/components/settings/SettingsRow.tsx";
import Switch from "@src/components/settings/Switch.tsx";
import { INSTALL_LABELS, useUpdates } from "./useUpdates.ts";

const AUTO_LOCATION = { id: null as string | null, label: "Auto · best" };

const CHANNEL_LABELS: Record<UpdateChannel, string> = {
  stable: "Stable",
  snapshot: "Snapshot",
  experimental: "Experimental",
};

const SEGMENT =
  "rounded-md px-2 py-1 text-[11px] leading-3.5 font-bold whitespace-nowrap";
const segmentClass = (pressed: boolean) =>
  `${SEGMENT} ${
    pressed
      ? "bg-bg-list shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
      : "text-text-subtle hover:text-text-primary hover:cursor-pointer"
  }`;

export default function GeneralTab(props: { onAbout: () => void }) {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  const updates = useUpdates();
  const [showChangelog, setShowChangelog] = createSignal(false);

  const release = () =>
    updates.isUpToDate() === false ? updates.decision().release : undefined;

  const checkDescription = () => {
    const checked = updates.lastChecked();
    const latest = release();
    if (latest) return `Version ${latest.version} available`;
    if (updates.isUpToDate()) {
      return checked ? `Up to date · checked ${checked}` : "Up to date";
    }
    return checked ? `Checked ${checked}` : "Never checked";
  };

  // Flags covers the colored and the old monochrome look, which stays until changed.
  const flagsShown = () => settings.flagDisplay !== "none";

  const [exporting, setExporting] = createSignal(false);
  const [exportError, setExportError] = createSignal<string | null>(null);
  const [savedPath, setSavedPath] = createSignal<string | null>(null);
  const [showUpload, setShowUpload] = createSignal(false);

  async function exportLogs() {
    setExporting(true);
    setExportError(null);
    setSavedPath(null);
    try {
      const downloadsPath = await downloadDir();
      const defaultPath = await join(downloadsPath, logBundleFileName());
      const dest = await save({
        defaultPath,
        filters: [{ name: "Zstandard archive", extensions: ["zst"] }],
      });
      if (!dest) {
        logInfo("Log export canceled in save dialog");
        setExportError("Export canceled");
        return;
      }
      setSavedPath(await VPNService.exportLogs(dest));
    } catch (e) {
      setExportError(String(e instanceof Error ? e.message : e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <SettingsHeading>Protection</SettingsHeading>
      <SettingsCard label="Protection">
        <SettingsRow icon="power" title="Connect when the app starts">
          <Switch
            label="Connect when the app starts"
            checked={settings.connectOnStartup}
            onChange={(on) => void settingsActions.setConnectOnStartup(on)}
          />
        </SettingsRow>
        <FeatureComing class="w-full">
          <SettingsRow
            icon="lock"
            title="Lockdown mode"
            description="Block all traffic whenever Gnosis VPN is not connected."
          >
            <Switch label="Lockdown mode" checked={false} disabled />
          </SettingsRow>
        </FeatureComing>
      </SettingsCard>

      <SettingsHeading>App</SettingsHeading>
      {/* No dismiss: an end of life cannot be waved away. */}
      <Show when={appState.endOfLife}>
        {(endOfLife) => {
          const now = createDeadlineClock(() =>
            Date.parse(endOfLife().ends_at)
          );
          return (
            <Notice tone="bad">
              {endOfLifeMessage(endOfLife(), now())}
              <Show when={endOfLife().reason.trim()}>
                {(reason) => <span class="block">{reason()}</span>}
              </Show>
            </Notice>
          );
        }}
      </Show>
      <Show when={updates.blocker()}>
        {(blocker) => (
          <Notice tone="bad">
            {blocker().message}
            <span class="mt-1 flex gap-3 font-bold">
              <Show when={blocker().retryable}>
                <button
                  type="button"
                  class="underline hover:cursor-pointer disabled:opacity-50"
                  disabled={updates.retrying()}
                  onClick={updates.retryToolkit}
                >
                  {updates.retrying() ? "Trying…" : "Try again"}
                </button>
              </Show>
              <button
                type="button"
                class="underline hover:cursor-pointer"
                onClick={() => updates.setShowHowTo(true)}
              >
                How to update
              </button>
            </span>
          </Notice>
        )}
      </Show>
      <Show when={!updates.blocker() && release()}>
        {(latest) => (
          <SettingsCard label="Update">
            <SettingsRow
              icon="update"
              title={`Update to ${latest().version}`}
              description={
                <>
                  <Show
                    when={updates.installError()}
                    fallback={updates.isMacos()
                      ? "Downloads, installs and restarts the app."
                      : "Shows how to update on this computer."}
                  >
                    {(error) => (
                      <span class="text-bad-ink">
                        Update failed — {error()}
                      </span>
                    )}
                  </Show>
                  <Show when={latest().release_notes}>
                    {" "}
                    <button
                      type="button"
                      class="font-bold text-text-link hover:cursor-pointer"
                      onClick={() => setShowChangelog(true)}
                    >
                      What’s new
                    </button>
                  </Show>
                </>
              }
            >
              <button
                type="button"
                class={ACTION_BUTTON}
                disabled={updates.installPhase() !== null}
                onClick={updates.install}
              >
                {updates.installPhase()
                  ? INSTALL_LABELS[updates.installPhase()!]
                  : "Update"}
              </button>
            </SettingsRow>
          </SettingsCard>
        )}
      </Show>
      <SettingsCard label="App">
        <SettingsRow icon="globe" title="Preferred exit">
          <Show
            when={appState.availableDestinations.length > 0}
            fallback={
              <span class="shrink-0 text-xs text-text-subtle">
                No exits available
              </span>
            }
          >
            <Dropdown
              size="quiet"
              ariaLabel="Preferred exit"
              class="max-w-36"
              options={[
                AUTO_LOCATION,
                ...appState.availableDestinations.map((d) => ({
                  id: d.id as string | null,
                  label: destinationLabel(d),
                })),
              ]}
              value={settings.preferredLocation
                ? {
                  id: settings.preferredLocation,
                  label: destinationLabelById(
                    settings.preferredLocation,
                    appState.availableDestinations,
                  ),
                }
                : AUTO_LOCATION}
              onChange={(o) => void settingsActions.setPreferredLocation(o.id)}
              itemToString={(o) => o.label}
            />
          </Show>
        </SettingsRow>
        <SettingsRow
          icon="eye"
          title="Detailed metrics"
          description="Last check, load, path and relays under the exit on the main screen."
        >
          <Switch
            label="Detailed metrics"
            checked={settings.showDetailedMetrics}
            onChange={(on) => void settingsActions.setShowDetailedMetrics(on)}
          />
        </SettingsRow>
        <SettingsRow icon="window" title="Start minimized">
          <Switch
            label="Start minimized"
            checked={settings.startMinimized}
            onChange={(on) => void settingsActions.setStartMinimized(on)}
          />
        </SettingsRow>
        <SettingsRow icon="flag" title="Exit icons">
          <div
            role="group"
            aria-label="Exit icons"
            class="flex shrink-0 gap-0.5 rounded-lg bg-control-bg p-0.5"
          >
            <FeatureComing>
              <button
                type="button"
                class={`${segmentClass(false)} opacity-50`}
                aria-pressed={false}
                disabled
              >
                Node icon
              </button>
            </FeatureComing>
            <For
              each={[
                { label: "Flags", pressed: flagsShown, display: "color" },
                {
                  label: "None",
                  pressed: () => !flagsShown(),
                  display: "none",
                },
              ] as const}
            >
              {(option) => (
                <button
                  type="button"
                  class={segmentClass(option.pressed())}
                  aria-pressed={option.pressed()}
                  onClick={() => {
                    if (settings.flagDisplay !== option.display) {
                      void settingsActions.setFlagDisplay(option.display);
                    }
                  }}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
        </SettingsRow>
        <Show when={!updates.blocker()}>
          <SettingsRow
            icon="sync"
            title="Check for updates"
            description={checkDescription()}
          >
            <button
              type="button"
              class={ROW_BUTTON}
              disabled={updates.checking() || updates.installPhase() !== null}
              onClick={updates.check}
            >
              {updates.checking() ? "Checking…" : "Check"}
            </button>
          </SettingsRow>
        </Show>
        <SettingsRow
          icon="clock"
          title="Check automatically"
          description="Only while connected through Gnosis VPN."
        >
          <Switch
            label="Check for updates automatically"
            checked={settings.updateCheck}
            onChange={(on) => void settingsActions.setUpdateCheck(on)}
          />
        </SettingsRow>
        <FeatureComing class="w-full">
          <SettingsRow icon="layers" title="Update channel">
            <span class="shrink-0 text-xs text-text-subtle">
              {CHANNEL_LABELS[updates.channel()]}
            </span>
          </SettingsRow>
        </FeatureComing>
      </SettingsCard>

      <SettingsHeading>Logs, for support</SettingsHeading>
      <SettingsCard label="Logs, for support">
        <SettingsRow
          icon="file"
          title="Export logs"
          description={
            <Show when={exportError()} fallback="Saved on this computer.">
              <span class="text-bad-ink">{exportError()}</span>
            </Show>
          }
        >
          <button
            type="button"
            class={ROW_BUTTON}
            disabled={exporting()}
            onClick={() => void exportLogs()}
          >
            {exporting() ? "Exporting…" : "Export"}
          </button>
        </SettingsRow>
        <SettingsRow
          icon="upload"
          title="Upload logs"
          description="Sent to support. Check what’s included first."
        >
          <button
            type="button"
            class={ROW_BUTTON}
            onClick={() => {
              setExportError(null);
              setShowUpload(true);
            }}
          >
            Upload
          </button>
        </SettingsRow>
      </SettingsCard>

      <div class="mt-3 shrink-0">
        <SettingsCard>
          <SettingsRow icon="info" title="About" onClick={props.onAbout}>
            <BackIcon class="rotate-180 text-text-subtle" />
          </SettingsRow>
        </SettingsCard>
      </div>

      <CheckUpdateModal
        open={updates.showCheckModal()}
        onClose={updates.closeCheckModal}
        onCheckAnyway={updates.checkAnyway}
        onConnectAndCheck={updates.connectAndCheck}
      />
      <InstallUpdateModal
        open={updates.showInstallModal()}
        onClose={updates.closeInstallModal}
        onInstallAnyway={updates.installAnyway}
        onConnectAndInstall={updates.connectAndInstall}
      />
      <HowToUpdateModal
        open={updates.showHowTo()}
        onClose={() => updates.setShowHowTo(false)}
      />
      <Modal open={showChangelog()} onClose={() => setShowChangelog(false)}>
        <div class="flex flex-col gap-4">
          <div class="text-base font-semibold text-text-primary">
            What’s new in {release()?.version}
          </div>
          <div class="max-h-64 overflow-y-auto">
            <div class="pr-4.5">
              <Markdown>{release()?.release_notes ?? ""}</Markdown>
            </div>
          </div>
          <button
            type="button"
            class="h-10 px-4 text-sm rounded-lg font-bold border border-border bg-transparent text-text-primary hover:bg-darken hover:cursor-pointer transition-colors"
            onClick={() => setShowChangelog(false)}
          >
            Close
          </button>
        </div>
      </Modal>
      <ExportLogsModal path={savedPath()} onClose={() => setSavedPath(null)} />
      <UploadLogsModal
        open={showUpload()}
        onClose={() => setShowUpload(false)}
      />
    </>
  );
}
