import { createResource, createSignal, type JSX, Show } from "solid-js";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "@src/stores/appStore.ts";
import { logWarn } from "@src/utils/appLog.ts";
import PageHeader from "@src/components/common/PageHeader.tsx";
import {
  SettingsCard,
  SettingsHeading,
} from "@src/components/settings/SettingsGroup.tsx";

const SOURCE_URL = "https://github.com/gnosis/gnosis_vpn-app";
const IPINFO_URL = "https://ipinfo.io";
const FLAG_ICONS_URL = "https://github.com/lipis/flag-icons";

const REVEAL_CLICKS = 7;
const REVEAL_WINDOW_MS = 2000;

async function open(url: string) {
  try {
    await openUrl(url);
  } catch (e) {
    logWarn(`Failed to open ${url}: ${e}`);
  }
}

function Link(props: { url: string; label: string }) {
  return (
    <button
      type="button"
      class="font-bold text-text-link hover:cursor-pointer"
      onClick={() => void open(props.url)}
    >
      {props.label}
    </button>
  );
}

function Notes(props: { children: JSX.Element }) {
  return (
    <SettingsCard>
      <div class="flex flex-col gap-1 px-3 py-2.5 text-xs leading-normal text-text-subtle">
        {props.children}
      </div>
    </SettingsCard>
  );
}

export default function AboutPage(props: { onBack: () => void }) {
  const [appState] = useAppStore();
  const [appVersion] = createResource(() => getVersion());
  const [showVersionDetails, setShowVersionDetails] = createSignal(false);
  let versionClickCount = 0;
  let lastVersionClickAt = 0;

  const handleVersionClick = () => {
    const now = Date.now();
    versionClickCount = now - lastVersionClickAt > REVEAL_WINDOW_MS
      ? 1
      : versionClickCount + 1;
    lastVersionClickAt = now;
    if (versionClickCount >= REVEAL_CLICKS) {
      setShowVersionDetails(true);
      versionClickCount = 0;
    }
  };

  return (
    <div class="fixed inset-0 z-100 flex flex-col bg-bg-primary text-text-primary page-slide-in">
      <PageHeader title="About" onBack={props.onBack} />
      <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-1 pb-4.5">
        <Notes>
          <span class="text-[13px] leading-4.5 font-bold text-text-primary">
            Gnosis VPN
          </span>
          <div
            onClick={handleVersionClick}
            classList={{ "select-text": showVersionDetails() }}
          >
            Version{" "}
            <span class="font-figures text-text-primary">
              {appState.packageVersion ?? "unknown"}
            </span>
          </div>
          <Show when={showVersionDetails()}>
            <div class="select-text">
              Service {appState.serviceInfo?.version ?? "—"} · App{" "}
              {appVersion() ?? "—"} · Toolkit {appState.toolkit.version ?? "—"}
            </div>
          </Show>
          <div>
            Licensed under GPL-3.0 ·{" "}
            <Link url={SOURCE_URL} label="Source code" />
          </div>
        </Notes>

        <SettingsHeading>Third-party notices</SettingsHeading>
        {/* CC BY-SA 4.0 attribution; the offline note keeps users from assuming their IP goes to IPinfo. */}
        <Notes>
          <span class="text-[13px] leading-4.5 text-text-primary">IPinfo</span>
          <div>
            Exit countries come from an offline database on this device. Nothing
            is sent to IPinfo.
          </div>
          <div>
            IP address data is powered by{" "}
            <Link url={IPINFO_URL} label="IPinfo" />, licensed under CC BY-SA
            4.0.
          </div>
        </Notes>
        <Notes>
          <span class="text-[13px] leading-4.5 text-text-primary">
            Flag art
          </span>
          <div>
            Flags from{" "}
            <Link url={FLAG_ICONS_URL} label="flag-icons" />, licensed under
            MIT.
          </div>
        </Notes>
      </div>
    </div>
  );
}
