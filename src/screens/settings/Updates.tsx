import Toggle from "@src/components/common/Toggle.tsx";
import UpdateStatusCard from "@src/components/common/UpdateStatusCard.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";

export default function Updates() {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  return (
    <div class="space-y-4 w-full p-6 max-w-lg bg-bg-primary select-none flex flex-col h-full">
      <UpdateStatusCard />
      <Toggle
        label="Automatic update check"
        checked={settings.updateCheck}
        onChange={(e) =>
          void settingsActions.setUpdateCheck(e.currentTarget.checked)}
        description="Done only when connected through the Gnosis VPN"
      />
      <div class="grow" />
      <div class="space-y-1 text-sm text-text-secondary text-center">
        <div>
          Package version:{" "}
          <span class="text-text-primary">
            {appState.serviceInfo?.package_version ?? "—"}
          </span>
        </div>
        <div class="text-xs">
          Service version:{" "}
          <span class="text-text-primary">
            {appState.serviceInfo?.version ?? "—"}
          </span>
        </div>
        <div class="text-xs">
          App version:{" "}
          <span class="text-text-primary">{appState.appVersion ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}
