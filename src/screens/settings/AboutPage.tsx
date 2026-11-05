import type { JSX } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { logWarn } from "@src/utils/appLog.ts";
import { CHANNEL_LABELS, effectiveChannel } from "@src/utils/version.ts";
import {
  SettingsCard,
  SettingsHeading,
} from "@src/components/settings/SettingsGroup.tsx";
import SettingsSubpage from "./SettingsSubpage.tsx";

const SOURCE_URL = "https://github.com/gnosis/gnosis_vpn-app";
const IPINFO_URL = "https://ipinfo.io";
const FLAG_ICONS_URL = "https://github.com/lipis/flag-icons";
const LINETO_URL = "https://lineto.com";
const JETBRAINS_MONO_URL = "https://www.jetbrains.com/lp/mono/";

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
  const [settings] = useSettingsStore();

  return (
    <SettingsSubpage title="About" onBack={props.onBack}>
      <Notes>
        <span class="text-[13px] leading-4.5 font-bold text-text-primary">
          Gnosis VPN
        </span>
        <div>
          Version{" "}
          <span class="font-figures text-text-primary">
            {appState.packageVersion ?? "unknown"}
          </span>
        </div>
        <div>
          Channel{" "}
          <span class="text-text-primary">
            {CHANNEL_LABELS[
              effectiveChannel(appState.packageVersion, settings.channel)
            ]}
          </span>
        </div>
        <div>
          Licensed under GPL-3.0 · <Link url={SOURCE_URL} label="Source code" />
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
          <Link url={IPINFO_URL} label="IPinfo" />, licensed under CC BY-SA 4.0.
        </div>
      </Notes>
      <Notes>
        <span class="text-[13px] leading-4.5 text-text-primary">
          Flag art
        </span>
        <div>
          Flags from{" "}
          <Link url={FLAG_ICONS_URL} label="flag-icons" />, licensed under MIT.
        </div>
      </Notes>
      <Notes>
        <span class="text-[13px] leading-4.5 text-text-primary">Fonts</span>
        <div>
          Unica77 by <Link url={LINETO_URL} label="Lineto" />.
        </div>
        <div>
          <Link url={JETBRAINS_MONO_URL} label="JetBrains Mono" />, licensed
          under the SIL Open Font License 1.1.
        </div>
      </Notes>
    </SettingsSubpage>
  );
}
