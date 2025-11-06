import { Dropdown } from "@src/components/common/Dropdown";
import Toggle from "@src/components/common/Toggle.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { type Destination } from "@src/services/vpnService.ts";
import {
  formatDestination,
  formatDestinationByAddress,
} from "@src/utils/destinations.ts";
import { Show } from "solid-js";

export default function Settings() {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const availableDestinations = appState.availableDestinations.map((e: Destination) => {
    return {
      address: e.address,
      label: formatDestination(e),
    };
  });

  console.log(availableDestinations);

  return (
    <div class="space-y-4 w-full p-6 max-w-lg">
      <Toggle
        label="Connect on application startup"
        checked={settings.connectOnStartup}
        onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
          void settingsActions.setConnectOnStartup(e.currentTarget.checked)}
      />
      <Toggle
        label="Start application minimized"
        checked={settings.startMinimized}
        onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
          void settingsActions.setStartMinimized(e.currentTarget.checked)}
      />

      <label class="flex items-center justify-between gap-2">
        Preferred server location
        <Show
          when={appState.availableDestinations.length > 0}
          fallback={
            <div class="text-sm text-gray-500">No servers available</div>
          }
        >
          <Dropdown
            options={appState.availableDestinations.map((e: Destination) => {
              return {
                address: e.address,
                label: formatDestination(e),
              };
            })}
            value={settings.preferredLocation
              ? {
                address: settings.preferredLocation,
                label: formatDestinationByAddress(
                  settings.preferredLocation,
                  appState.availableDestinations,
                ),
              }
              : null}
            onChange={(e: { address: string; label: string }) =>
              void settingsActions.setPreferredLocation(e.address)}
            size="sm"
            itemToString={(e: { address: string; label: string }) => e.label}
          />
        </Show>
      </label>
    </div>
  );
}
