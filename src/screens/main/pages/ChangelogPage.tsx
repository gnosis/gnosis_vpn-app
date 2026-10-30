import { createMemo, Show } from "solid-js";
import { Markdown } from "@src/components/common/Markdown.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { resolveUpdateDecision } from "@src/utils/updateAvailability.ts";

/** Software update → changelog: the release notes of the available update. */
export default function ChangelogPage() {
  const [appState] = useAppStore();
  const [settings] = useSettingsStore();

  const release = createMemo(() =>
    resolveUpdateDecision({
      outcome: settings.lastCheckOutcome,
      packageVersion: appState.packageVersion,
      dismissedVersion: settings.dismissedUpdateVersion,
    }).release
  );

  return (
    <div class="flex flex-col gap-3 rounded-xl border border-border bg-bg-surface px-4 py-4">
      <Show
        when={release()}
        fallback={
          <span class="text-sm text-text-secondary">
            No release notes available.
          </span>
        }
      >
        {(r) => (
          <>
            <span class="text-base font-semibold text-text-primary">
              Version {r().version}
            </span>
            <Markdown>{r().release_notes || ""}</Markdown>
          </>
        )}
      </Show>
    </div>
  );
}
