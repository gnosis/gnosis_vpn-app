import { Dropdown } from "../../components/common/Dropdown.tsx";
import Toggle from "@src/components/common/Toggle.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import {
  destinationLabel,
  destinationLabelById,
} from "@src/utils/destinations.ts";
import { Show } from "solid-js";

export default function Settings() {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  return (
    <div class="space-y-4 w-full p-6 max-w-lg bg-bg-primary select-none flex flex-col h-full">
      <label class="flex items-center justify-between gap-2 text-text-primary">
        Preferred server location
        <Show
          when={appState.availableDestinations.length > 0}
          fallback={
            <div class="text-sm text-text-secondary">No servers available</div>
          }
        >
          <Dropdown
            options={appState.availableDestinations.map((e) => {
              return {
                id: e.id,
                label: destinationLabel(e),
              };
            })}
            value={settings.preferredLocation
              ? {
                id: settings.preferredLocation,
                label: destinationLabelById(
                  settings.preferredLocation,
                  appState.availableDestinations,
                ),
              }
              : null}
            onChange={(e) => void settingsActions.setPreferredLocation(e.id)}
            size="sm"
            itemToString={(e) => e.label}
          />
        </Show>
      </label>
      <Toggle
        label="Connect on application startup"
        checked={settings.connectOnStartup}
        onChange={(e) =>
          void settingsActions.setConnectOnStartup(e.currentTarget.checked)}
      />
      <Toggle
        label="Start application minimized"
        checked={settings.startMinimized}
        onChange={(e) =>
          void settingsActions.setStartMinimized(e.currentTarget.checked)}
      />
      <div class="grow" />
      <div class="space-y-1 text-sm text-text-secondary text-center">
        <Show when={appState.serviceInfo?.package_version}>
          {(pkgVersion) => (
            <div>
              Package version:{" "}
              <span class="text-text-primary">{pkgVersion()}</span>
            </div>
          )}
        </Show>
        <Show when={appState.serviceInfo?.version}>
          {(version) => (
            <div class="text-xs">
              Service version:{" "}
              <span class="text-text-primary">{version()}</span>
            </div>
          )}
        </Show>
        <div class="text-xs">
          App version:{" "}
          <span class="text-text-primary">{appState.appVersion ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}
