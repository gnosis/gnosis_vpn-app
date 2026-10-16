import { createSignal, For, Show } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import flagNotice from "@assets/flags/NOTICE.md?raw";
import { parseFlagAttributions } from "@src/utils/flagNotice.ts";
import { logWarn } from "@src/utils/appLog.ts";

const SOURCE_URL = "https://github.com/gnosis/gnosis_vpn-app";
const IPINFO_URL = "https://ipinfo.io";

const flagAttributions = parseFlagAttributions(flagNotice);

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
  const [showFlags, setShowFlags] = createSignal(false);

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
            IP address data is powered by{" "}
            <Link url={IPINFO_URL} label="IPinfo" />, licensed under CC BY-SA
            4.0.
          </div>
          <div class="text-xs">
            Exit countries come from an offline database on this device. Nothing
            is sent to IPinfo.
          </div>
        </div>

        <div class="space-y-1">
          <div class="text-text-primary">Flag art</div>
          <div>
            Country flags from flag-icons (MIT). Subdivision flags from
            Wikimedia Commons, used under the licences credited below.
          </div>
          <button
            type="button"
            class="underline text-text-primary cursor-pointer"
            onClick={() => setShowFlags(!showFlags())}
          >
            {showFlags()
              ? "Hide credits"
              : `Show all credits (${flagAttributions.length})`}
          </button>
          <Show when={showFlags()}>
            <ul class="space-y-1 text-xs select-text">
              <For each={flagAttributions}>
                {(a) => (
                  <li>
                    <span class="text-text-primary">{a.source}</span>
                    {` · ${a.licence}`}
                    <Show when={a.author}>{` · ${a.author}`}</Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </div>
  );
}
