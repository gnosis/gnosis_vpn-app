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
    <div class="space-y-4 w-full p-6 max-w-lg bg-bg-primary flex flex-col h-full">
      <label class="flex items-center justify-between gap-2 text-text-primary">
        Preferred server location
        <Show
          when={appState.availableDestinations.length > 0}
          fallback={
            <div class="text-sm text-text-secondary">No servers available</div>
          }
        >
          <Dropdown
            options={[
              { id: null as string | null, label: "No preference" },
              ...appState.availableDestinations.map((e) => ({
                id: e.id as string | null,
                label: destinationLabel(e),
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
              : { id: null, label: "No preference" }}
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
    </div>
  );
}
