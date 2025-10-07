import Toggle from "@src/components/common/Toggle.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { formatDestination } from "@src/utils/destinations.ts";
import { For, Show } from "solid-js";

export default function Settings() {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  return (
    <div class="space-y-4 w-full p-6 max-w-lg">
      <Toggle
        label="Connect on application startup"
        checked={settings.connectOnStartup}
        onChange={e => void settingsActions.setConnectOnStartup(e.currentTarget.checked)}
      />
      <Toggle
        label="Start application minimized"
        checked={settings.startMinimized}
        onChange={e => void settingsActions.setStartMinimized(e.currentTarget.checked)}
      />

      <label class="flex items-center justify-between gap-2">
        Preferred server location
        <Show when={appState.availableDestinations.length > 0} fallback={<div>No servers available</div>}>
          <select
            class=""
            value={settings.preferredLocation ?? ""}
            onChange={e => void settingsActions.setPreferredLocation(e.currentTarget.value || null)}
          >
            <For each={appState.availableDestinations}>
              {dest => <option value={dest.address}>{formatDestination(dest)}</option>}
            </For>
          </select>
        </Show>
      </label>
    </div>
  );
}
