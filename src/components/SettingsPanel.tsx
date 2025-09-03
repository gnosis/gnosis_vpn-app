export default function SettingsPanel() {
  return (
    <div class="space-y-4">
      <div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Placeholder for application settings.
        </p>
      </div>
      <div class="space-y-2">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="h-4 w-4" />
          Enable notifications
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="h-4 w-4" />
          Start on login
        </label>
      </div>
    </div>
  );
}
