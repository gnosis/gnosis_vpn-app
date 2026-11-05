import {
  createEffect,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Switch,
} from "solid-js";
import PageHeader from "@src/components/common/PageHeader.tsx";
import {
  clearSettingsRequest,
  closeSettings,
  settingsRequest,
  type SettingsTab,
  settingsTab,
  showSettingsTab,
} from "@src/utils/settingsPage.ts";
import GeneralTab from "./GeneralTab.tsx";
import UsageTab from "./UsageTab.tsx";
import UpdatePage from "./UpdatePage.tsx";
import AboutPage from "./AboutPage.tsx";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "usage", label: "Usage" },
];

/** The main window's Settings page (Stage 2.1 mock): General and Usage tabs, Update and About behind rows. */
export default function SettingsPage() {
  const [subpage, setSubpage] = createSignal<"update" | "about" | null>(null);

  // The tabs sit under an open subpage, so a tab change comes from outside (tray, top bar) and shows that tab.
  createEffect(on(settingsTab, () => setSubpage(null), { defer: true }));
  createEffect(() => {
    const request = settingsRequest();
    if (request === "update") {
      clearSettingsRequest();
      setSubpage("update");
    } else if (request === "check-update") {
      // the Update page takes the request and runs the check
      setSubpage("update");
    }
  });

  function handleKeyDown(e: KeyboardEvent) {
    // an open dialog or dropdown closes on its own Escape
    if (
      e.key !== "Escape" || e.defaultPrevented ||
      document.querySelector('[aria-modal="true"]')
    ) {
      return;
    }
    if (subpage()) setSubpage(null);
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
              <GeneralTab
                onUpdate={() => setSubpage("update")}
                onAbout={() => setSubpage("about")}
              />
            </Match>
            <Match when={settingsTab() === "usage"}>
              <UsageTab />
            </Match>
          </Switch>
        </div>
      </div>
      <Switch>
        <Match when={subpage() === "update"}>
          <UpdatePage onBack={() => setSubpage(null)} />
        </Match>
        <Match when={subpage() === "about"}>
          <AboutPage onBack={() => setSubpage(null)} />
        </Match>
      </Switch>
    </>
  );
}
