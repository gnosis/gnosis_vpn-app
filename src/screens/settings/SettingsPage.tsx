import {
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import PageHeader from "@src/components/common/PageHeader.tsx";
import {
  closeSettings,
  type SettingsTab,
  settingsTab,
  showSettingsTab,
} from "@src/utils/settingsPage.ts";
import GeneralTab from "./GeneralTab.tsx";
import UsageTab from "./UsageTab.tsx";
import AboutPage from "./AboutPage.tsx";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "usage", label: "Usage" },
];

/** The main window's Settings page (Stage 2.1 mock): General and Usage tabs, About behind a row. */
export default function SettingsPage() {
  const [aboutOpen, setAboutOpen] = createSignal(false);

  function handleKeyDown(e: KeyboardEvent) {
    // an open dialog or dropdown closes on its own Escape
    if (
      e.key !== "Escape" || e.defaultPrevented ||
      document.querySelector('[aria-modal="true"]')
    ) {
      return;
    }
    if (aboutOpen()) setAboutOpen(false);
    else closeSettings();
  }

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  return (
    <>
      <div class="fixed inset-0 z-100 flex flex-col bg-bg-primary text-text-primary page-slide-in">
        <PageHeader title="Settings" onBack={closeSettings} />
        <div
          role="group"
          aria-label="Settings sections"
          class="mx-3 mt-0.5 mb-2 flex shrink-0 gap-0.5 rounded-lg bg-control-bg p-0.75"
        >
          <For each={TABS}>
            {(tab) => (
              <button
                type="button"
                aria-pressed={settingsTab() === tab.id}
                class={`flex-1 rounded-md p-2 text-xs leading-4 font-bold ${
                  settingsTab() === tab.id
                    ? "bg-bg-list shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
                    : "text-text-subtle hover:text-text-primary hover:cursor-pointer"
                }`}
                onClick={() => showSettingsTab(tab.id)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-1 pb-4.5">
          <Switch>
            <Match when={settingsTab() === "general"}>
              <GeneralTab onAbout={() => setAboutOpen(true)} />
            </Match>
            <Match when={settingsTab() === "usage"}>
              <UsageTab />
            </Match>
          </Switch>
        </div>
      </div>
      <Show when={aboutOpen()}>
        <AboutPage onBack={() => setAboutOpen(false)} />
      </Show>
    </>
  );
}
