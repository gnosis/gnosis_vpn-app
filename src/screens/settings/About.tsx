import { openUrl } from "@tauri-apps/plugin-opener";
import { logWarn } from "@src/utils/appLog.ts";

const SOURCE_URL = "https://github.com/gnosis/gnosis_vpn-app";
const IPINFO_URL = "https://ipinfo.io";
const FLAG_ICONS_URL = "https://github.com/lipis/flag-icons";

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
      class="underline text-text-primary cursor-pointer"
      onClick={() => void open(props.url)}
    >
      {props.label}
    </button>
  );
}

export default function About() {
  return (
    <div class="space-y-4 w-full p-6 max-w-lg bg-bg-primary flex flex-col flex-1 min-h-0 overflow-y-auto text-sm text-text-secondary">
      <div class="space-y-1">
        <div class="text-base font-medium text-text-primary">Gnosis VPN</div>
        <div>
          Licensed under GPL-3.0 · <Link url={SOURCE_URL} label="Source code" />
        </div>
      </div>

      <div class="space-y-3">
        <div class="text-base font-medium text-text-primary">
          Third-party notices
        </div>

        {/* CC BY-SA 4.0 attribution; the offline note keeps users from assuming their IP goes to IPinfo. */}
        <div class="space-y-1">
          <div class="text-text-primary">IPinfo</div>
          <div>
            Exit countries come from an offline database on this device. Nothing
            is sent to IPinfo.
          </div>
          <div>
            IP address data is powered by{" "}
            <Link url={IPINFO_URL} label="IPinfo" />, licensed under CC BY-SA
            4.0.
          </div>
        </div>

        <div class="space-y-1">
          <div class="text-text-primary">Flag art</div>
          <div>
            Flags from{" "}
            <Link url={FLAG_ICONS_URL} label="flag-icons" />, licensed under
            MIT.
          </div>
        </div>
      </div>
    </div>
  );
}
