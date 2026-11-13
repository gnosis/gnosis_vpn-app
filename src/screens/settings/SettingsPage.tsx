import {
  createEffect,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Switch,
  untrack,
} from "solid-js";
import PageHeader from "@src/components/common/PageHeader.tsx";
import PageLayer from "@src/components/common/PageLayer.tsx";
import { segmentStateClass } from "@src/components/settings/segment.ts";
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
import SendFundsPage from "./SendFundsPage.tsx";
import { useUpdates } from "./useUpdates.ts";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "usage", label: "Usage" },
];

/** The main window's Settings page (Stage 2.1 mock): General and Usage tabs, Update, About and Send funds behind rows. */
export default function SettingsPage() {
  const [subpage, setSubpage] = createSignal<
    "update" | "about" | "send-funds" | null
  >(null);
  const updates = useUpdates();

  // The tabs sit under an open subpage, so a tab change comes from outside (tray, top bar) and shows that tab.
  createEffect(on(settingsTab, () => setSubpage(null), { defer: true }));
  createEffect(() => {
    const request = settingsRequest();
    if (request !== "update" && request !== "check-update") return;
    clearSettingsRequest();
    setSubpage("update");
    if (request === "check-update") untrack(updates.check);
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
      <PageLayer label="Settings">
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
                  segmentStateClass(settingsTab() === tab.id)
                }`}
                onClick={() => showSettingsTab(tab.id)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-2 pl-3 scroller-3 pt-1 pb-4.5">
          <Switch>
            <Match when={settingsTab() === "general"}>
              <GeneralTab
                onUpdate={() => setSubpage("update")}
                onAbout={() => setSubpage("about")}
              />
            </Match>
            <Match when={settingsTab() === "usage"}>
              <UsageTab onAddFunds={() => setSubpage("send-funds")} />
            </Match>
          </Switch>
        </div>
      </PageLayer>
      <Switch>
        <Match when={subpage() === "update"}>
          <UpdatePage onBack={() => setSubpage(null)} />
        </Match>
        <Match when={subpage() === "about"}>
          <AboutPage onBack={() => setSubpage(null)} />
        </Match>
        <Match when={subpage() === "send-funds"}>
          <SendFundsPage onBack={() => setSubpage(null)} />
        </Match>
      </Switch>
    </>
  );
}
