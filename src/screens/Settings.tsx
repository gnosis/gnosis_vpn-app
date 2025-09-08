import { SecondaryScreen } from '../components/common/SecondaryScreen';
import Toggle from '../components/common/Toggle';

export default function Settings() {
  return (
    <SecondaryScreen>
      <div class="space-y-4 p-6">
        <div class="space-y-2">
          <Toggle label="Connect on application startup" />
          <Toggle label="Start application minimized" />

          <label class="flex items-center gap-2 text-sm">
            Preferred server location
            <input type="text" class="h-4" />
          </label>
        </div>
      </div>
    </SecondaryScreen>
  );
}
