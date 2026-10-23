import { createMemo, createSignal, Show } from "solid-js";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir, join } from "@tauri-apps/api/path";
import { Dropdown } from "@src/components/common/Dropdown.tsx";
import { Row, Section } from "@src/components/common/GroupedList.tsx";
import Toggle from "@src/components/common/Toggle.tsx";
import ExportLogsModal from "@src/components/ExportLogsModal.tsx";
import UploadLogsModal from "@src/components/UploadLogsModal.tsx";
import InfoCircleIcon from "@src/components/icons/InfoCircleIcon.tsx";
import SyncIcon from "@src/components/icons/SyncIcon.tsx";
import { VPNService } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { push } from "@src/stores/pageStack.ts";
import {
  type FlagDisplay,
  useSettingsStore,
} from "@src/stores/settingsStore.ts";
import { logInfo } from "@src/utils/appLog.ts";
import {
  destinationLabel,
  destinationLabelById,
} from "@src/utils/destinations.ts";
import { logBundleFileName } from "@src/utils/logBundle.ts";
import { resolveUpdateDecision } from "@src/utils/updateAvailability.ts";
import { updateChecking } from "@src/utils/updateChecker.ts";

const FLAG_DISPLAY_OPTIONS: { id: FlagDisplay; label: string }[] = [
  { id: "none", label: "Off" },
  { id: "mono", label: "Monochromatic" },
  { id: "color", label: "Colored" },
];

/** The gear's page: every setting the separate window used to hold, as a grouped list. */
export default function SettingsPage() {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const preferred = () =>
    settings.preferredLocation
      ? {
        id: settings.preferredLocation as string | null,
        label: destinationLabelById(
          settings.preferredLocation,
          appState.availableDestinations,
        ),
      }
      : { id: null as string | null, label: "No preference" };

  const updateValue = createMemo(() => {
    if (updateChecking()) return "Checking…";
    const decision = resolveUpdateDecision({
      outcome: settings.lastCheckOutcome,
      packageVersion: appState.packageVersion,
      dismissedVersion: settings.dismissedUpdateVersion,
    });
    if (decision.isUpToDate === false) return "Update available";
    if (decision.isUpToDate === true) return "Up to date";
    return "Not checked yet";
  });

  // Export / upload logs: the flows the separate window's buttons ran.
  const [exporting, setExporting] = createSignal(false);
  const [savedPath, setSavedPath] = createSignal<string | null>(null);
  const [showUpload, setShowUpload] = createSignal(false);
  const [logError, setLogError] = createSignal<string | null>(null);

  const exportLogs = async () => {
    setExporting(true);
    setLogError(null);
    try {
      const dest = await save({
        defaultPath: await join(await downloadDir(), logBundleFileName()),
        filters: [{ name: "Zstandard archive", extensions: ["zst"] }],
      });
      if (!dest) {
        logInfo("Log export canceled in save dialog");
        return;
      }
      setSavedPath(await VPNService.exportLogs(dest));
    } catch (e) {
      setLogError(String(e instanceof Error ? e.message : e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Section title="Connection">
        <Row
          label="Preferred location"
          control={
            <Show
              when={appState.availableDestinations.length > 0}
              fallback={<span class="text-xs">No servers available</span>}
            >
              <Dropdown
                options={[
                  { id: null as string | null, label: "No preference" },
                  ...appState.availableDestinations.map((e) => ({
                    id: e.id as string | null,
                    label: destinationLabel(e),
                  })),
                ]}
                value={preferred()}
                onChange={(e) =>
                  void settingsActions.setPreferredLocation(e.id)}
                size="compact"
                itemToString={(e) => e.label}
              />
            </Show>
          }
        />
        <Row
          label="Connect on startup"
          control={
            <Toggle
              small
              aria-label="Connect on startup"
              checked={settings.connectOnStartup}
              onChange={(e) =>
                void settingsActions.setConnectOnStartup(
                  e.currentTarget.checked,
                )}
            />
          }
        />
        <Row
          label="Start minimized"
          control={
            <Toggle
              small
              aria-label="Start minimized"
              checked={settings.startMinimized}
              onChange={(e) =>
                void settingsActions.setStartMinimized(
                  e.currentTarget.checked,
                )}
            />
          }
        />
      </Section>

      <Section title="Appearance">
        <Row
          label="Exit node flags"
          control={
            <Dropdown
              options={FLAG_DISPLAY_OPTIONS}
              value={FLAG_DISPLAY_OPTIONS.find((o) =>
                o.id === settings.flagDisplay
              ) ?? FLAG_DISPLAY_OPTIONS[2]}
              onChange={(o) => void settingsActions.setFlagDisplay(o.id)}
              size="compact"
              itemToString={(o) => o.label}
            />
          }
        />
      </Section>

      <Section title="App">
        <Row
          icon={<SyncIcon />}
          label="Software update"
          control={<span>{updateValue()}</span>}
          onClick={() => push("software-update")}
        />
        <Row
          icon={<InfoCircleIcon />}
          label="About Gnosis VPN"
          onClick={() => push("about")}
        />
      </Section>

      <Section title="Troubleshooting">
        <Row
          label={exporting() ? "Exporting logs…" : "Export logs…"}
          description={logError() ?? undefined}
          onClick={() => {
            if (!exporting()) void exportLogs();
          }}
        />
        <Row
          label="Upload logs…"
          onClick={() => {
            setLogError(null);
            setShowUpload(true);
          }}
        />
      </Section>

      <ExportLogsModal path={savedPath()} onClose={() => setSavedPath(null)} />
      <UploadLogsModal
        open={showUpload()}
        onClose={() => setShowUpload(false)}
      />
    </>
  );
}
