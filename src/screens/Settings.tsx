import { SecondaryScreen } from '../components/common/SecondaryScreen';
import Toggle from '../components/common/Toggle';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { VPNService } from '../services/vpnService';
import { For, Show } from 'solid-js';

export default function Settings() {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  return (
    <SecondaryScreen>
      <div class="space-y-4 p-6">
        <div class="space-y-2">
          <Toggle label="Connect on application startup" />
          <Toggle label="Start application minimized" />

          <label class="flex items-center justify-between gap-2">
            Preferred server location
            <Show
              when={appState.availableDestinations.length > 0}
              fallback={<div>No servers available</div>}
            >
              <select
                class=""
                value={settings.preferredLocation ?? ''}
                onChange={e =>
                  void settingsActions.setPreferredLocation(
                    e.currentTarget.value || null
                  )
                }
              >
                <For each={appState.availableDestinations}>
                  {dest => (
                    <option value={dest.address}>
                      {VPNService.formatDestination(dest)}
                    </option>
                  )}
                </For>
              </select>
            </Show>
          </label>
        </div>
      </div>
    </SecondaryScreen>
  );
}
