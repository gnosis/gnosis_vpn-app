import { createResource, createSignal, Show } from "solid-js";
import { getVersion } from "@tauri-apps/api/app";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { endOfLifeMessage } from "@src/utils/updateAvailability.ts";
import { createDeadlineClock } from "@src/utils/deadlineClock.ts";
import { CHANNEL_LABELS } from "@src/utils/version.ts";
import HowToUpdateModal from "@src/components/common/HowToUpdateModal.tsx";
import UpdateStatusCard from "@src/components/common/UpdateStatusCard.tsx";
import CheckUpdateModal from "@src/components/CheckUpdateModal.tsx";
import InstallUpdateModal from "@src/components/InstallUpdateModal.tsx";
import Notice from "@src/components/settings/Notice.tsx";
import { SettingsCard } from "@src/components/settings/SettingsGroup.tsx";
import SettingsRow from "@src/components/settings/SettingsRow.tsx";
import Switch from "@src/components/settings/Switch.tsx";
import SettingsSubpage from "./SettingsSubpage.tsx";
import { useUpdates } from "./useUpdates.ts";

const REVEAL_CLICKS = 7;
const REVEAL_WINDOW_MS = 2000;

// Selectable so a version can be copied into a bug report.
const VERSION_VALUE = "shrink-0 select-text text-xs text-text-subtle";

export default function UpdatePage(props: { onBack: () => void }) {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  const updates = useUpdates();
  const [appVersion] = createResource(() => getVersion());
  const [showVersionDetails, setShowVersionDetails] = createSignal(false);
  let versionClickCount = 0;
  let lastVersionClickAt = 0;

  const handleVersionClick = () => {
    const now = Date.now();
    versionClickCount = now - lastVersionClickAt > REVEAL_WINDOW_MS
      ? 1
      : versionClickCount + 1;
    lastVersionClickAt = now;
    if (versionClickCount >= REVEAL_CLICKS) {
      setShowVersionDetails(true);
      versionClickCount = 0;
    }
  };

  return (
    <SettingsSubpage title="Update" onBack={props.onBack}>
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
      <Show when={!updates.blocker()}>
        <UpdateStatusCard
          onCheck={updates.check}
          loading={updates.checking()}
          isUpToDate={updates.isUpToDate()}
          latestVersion={updates.decision().release?.version}
          releaseNotes={updates.decision().release?.release_notes}
          lastChecked={updates.lastChecked() ?? undefined}
          onInstall={updates.install}
          installPhase={updates.installPhase()}
          installError={updates.installError()}
        />
      </Show>
      <SettingsCard label="Update">
        <SettingsRow
          title="Check automatically"
          description="Only while connected through Gnosis VPN."
        >
          <Switch
            label="Check for updates automatically"
            checked={settings.updateCheck}
            onChange={(on) => void settingsActions.setUpdateCheck(on)}
          />
        </SettingsRow>
        <SettingsRow title="Update channel">
          <span class="shrink-0 text-xs text-text-subtle">
            {CHANNEL_LABELS[updates.channel()]}
          </span>
        </SettingsRow>
        <div classList={{ "select-text": showVersionDetails() }}>
          <div onClick={handleVersionClick}>
            <SettingsRow title="Version">
              <span class={VERSION_VALUE}>
                {appState.packageVersion ?? "Unknown"}
              </span>
            </SettingsRow>
          </div>
          <Show when={showVersionDetails()}>
            <SettingsRow title="Service version">
              <span class={VERSION_VALUE}>
                {appState.serviceInfo?.version ?? "—"}
              </span>
            </SettingsRow>
            <SettingsRow title="App version">
              <span class={VERSION_VALUE}>{appVersion() ?? "—"}</span>
            </SettingsRow>
            <SettingsRow title="Toolkit version">
              <span class={VERSION_VALUE}>
                {appState.toolkit.version ?? "—"}
              </span>
            </SettingsRow>
          </Show>
        </div>
      </SettingsCard>

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
    </SettingsSubpage>
  );
}
