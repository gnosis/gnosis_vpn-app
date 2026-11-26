import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir, join } from "@tauri-apps/api/path";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { type Destination, VPNService } from "@src/services/vpnService.ts";
import { exitDisplayName, exitShortId } from "@src/utils/destinations.ts";
import { logBundleFileName } from "@src/utils/logBundle.ts";
import { logInfo } from "@src/utils/appLog.ts";
import { Dropdown } from "@src/components/common/Dropdown.tsx";
import ExportLogsModal from "@src/components/ExportLogsModal.tsx";
import UploadLogsModal from "@src/components/UploadLogsModal.tsx";
import BackIcon from "@src/components/icons/BackIcon.tsx";
import AccountId from "@src/components/settings/AccountId.tsx";
import {
  SettingsCard,
  SettingsHeading,
} from "@src/components/settings/SettingsGroup.tsx";
import SettingsRow, {
  ROW_BUTTON,
} from "@src/components/settings/SettingsRow.tsx";
import Switch from "@src/components/settings/Switch.tsx";
import { useFunding } from "./useFunding.ts";

// One width for Export and Upload, wide enough for "Exporting…".
const LOG_BUTTON = `${ROW_BUTTON} w-20`;

/** An exit as the location list names it: country, then the end of its address. */
type ExitOption = { id: string | null; name: string; shortId: string | null };

const AUTO_LOCATION: ExitOption = {
  id: null,
  name: "Auto · best",
  shortId: null,
};

const exitOption = (d: Destination): ExitOption => ({
  id: d.id,
  name: exitDisplayName(d),
  shortId: exitShortId(d),
});

const exitOptionText = (o: ExitOption) =>
  o.shortId ? `${o.name} #${o.shortId}` : o.name;

/** In the list the id sits at the row's right edge; in the closed dropdown it follows the name. */
function ExitOptionLabel(props: { option: ExitOption; inList?: boolean }) {
  return (
    <span
      class={props.inList ? "flex items-baseline justify-between gap-3" : ""}
    >
      {props.option.name}
      <Show when={props.option.shortId}>
        <span
          class={`font-figures text-[10px] font-medium ${
            props.inList ? "shrink-0" : "ml-[0.35em]"
          }`}
        >
          #{props.option.shortId}
        </span>
      </Show>
    </span>
  );
}

// Module-level, so an export still running when the tab unmounts reports once it is back.
const [exporting, setExporting] = createSignal(false);
const [exportError, setExportError] = createSignal<string | null>(null);
const [savedPath, setSavedPath] = createSignal<string | null>(null);

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

export default function GeneralTab(
  props: { onUpdate: () => void; onAbout: () => void },
) {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  const { nodeAddress } = useFunding();
  const preferredExit = (): ExitOption => {
    const id = settings.preferredLocation;
    if (id === null) return AUTO_LOCATION;
    const d = appState.availableDestinations.find((d) => d.id === id) ??
      appState.destinations[id]?.destination;
    return d ? exitOption(d) : { id, name: "Unavailable exit", shortId: null };
  };

  // Set while a checked update is not installed, as on the top bar's gear.
  const updateWaiting = () => appState.availableVersion !== null;

  const [showUpload, setShowUpload] = createSignal(false);
  // an error seen here stays here; one from an export still running shows on return
  onCleanup(() => setExportError(null));

  const exitOptions = createMemo(() => [
    AUTO_LOCATION,
    ...appState.availableDestinations.map(exitOption),
  ]);

  return (
    <>
      <SettingsHeading>Protection</SettingsHeading>
      <SettingsCard label="Protection">
        <SettingsRow title="Connect when the app starts">
          <Switch
            label="Connect when the app starts"
            checked={settings.connectOnStartup}
            onChange={(on) => void settingsActions.setConnectOnStartup(on)}
          />
        </SettingsRow>
        <Show when={appState.bootstrapAvailable}>
          <SettingsRow
            title="Bootstrap mode"
            description="Use only the bootstrap exits and relays. Switching reconnects the VPN."
          >
            <Switch
              label="Bootstrap mode"
              checked={appState.serviceMode === "bootstrap"}
              onChange={(on) => void appActions.setBootstrapMode(on)}
            />
          </SettingsRow>
        </Show>
      </SettingsCard>

      <SettingsHeading>App Settings</SettingsHeading>
      <SettingsCard label="App Settings">
        <SettingsRow
          title="Advanced view"
          description="The main screen shows the exit's latency, load and route details."
        >
          <Switch
            label="Advanced view"
            checked={settings.advancedView}
            onChange={(on) => void settingsActions.setAdvancedView(on)}
          />
        </SettingsRow>
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
              options={exitOptions()}
              value={preferredExit()}
              onChange={(o) => void settingsActions.setPreferredLocation(o.id)}
              itemToString={exitOptionText}
              renderValue={(o) => <ExitOptionLabel option={o} />}
              renderOption={(o) => <ExitOptionLabel option={o} inList />}
            />
          </Show>
        </SettingsRow>
        <SettingsRow
          title="Hide data cost before connecting"
          description="Connect goes straight ahead instead of first showing the 600 MB an exit takes."
        >
          <Switch
            label="Hide data cost before connecting"
            checked={!settings.showExitCost}
            onChange={(hide) => void settingsActions.setShowExitCost(!hide)}
          />
        </SettingsRow>
        <SettingsRow title="Start minimized">
          <Switch
            label="Start minimized"
            checked={settings.startMinimized}
            onChange={(on) => void settingsActions.setStartMinimized(on)}
          />
        </SettingsRow>
      </SettingsCard>

      <SettingsHeading>Logs, for support</SettingsHeading>
      <SettingsCard label="Logs, for support">
        <SettingsRow
          title="Export logs"
          description={
            <Show when={exportError()} fallback="Saved on this computer.">
              <span class="text-bad-ink">{exportError()}</span>
            </Show>
          }
        >
          <button
            type="button"
            class={LOG_BUTTON}
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
            class={LOG_BUTTON}
            onClick={() => {
              setExportError(null);
              setShowUpload(true);
            }}
          >
            Upload
          </button>
        </SettingsRow>
      </SettingsCard>

      <SettingsHeading>Gnosis VPN</SettingsHeading>
      <SettingsCard label="Gnosis VPN">
        <SettingsRow
          icon="update"
          title="Update"
          description={updateWaiting()
            ? `Version ${appState.availableVersion} available`
            : undefined}
          onClick={props.onUpdate}
        >
          <Show when={updateWaiting()}>
            <span
              class="size-1.75 shrink-0 rounded-full bg-update-dot"
              aria-hidden="true"
            />
          </Show>
          <BackIcon class="rotate-180 text-text-subtle" />
        </SettingsRow>
        <SettingsRow icon="info" title="About" onClick={props.onAbout}>
          <BackIcon class="rotate-180 text-text-subtle" />
        </SettingsRow>
        <Show when={nodeAddress()}>
          {(address) => <AccountId address={address()} />}
        </Show>
      </SettingsCard>

      <ExportLogsModal path={savedPath()} onClose={() => setSavedPath(null)} />
      <UploadLogsModal
        open={showUpload()}
        onClose={() => setShowUpload(false)}
      />
    </>
  );
}
