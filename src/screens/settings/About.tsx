import { createSignal, Show } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { logWarn } from "@src/utils/appLog.ts";
import chromiumLicenseSource from "@assets/gpu-blocklist/LICENSE?raw";

const SOURCE_URL = "https://github.com/gnosis/gnosis_vpn-app";
const IPINFO_URL = "https://ipinfo.io";
const FLAG_ICONS_URL = "https://github.com/lipis/flag-icons";
const CHROMIUM_BLOCKLIST_URL =
  "https://chromium.googlesource.com/chromium/src/+/main/gpu/config/software_rendering_list.json";
// Chromium's LICENSE is a C++ comment hard-wrapped at 80 columns; unwrap it, keeping paragraphs and bullets.
const CHROMIUM_LICENSE = chromiumLicenseSource
  .replace(/^\/\/ ?/gm, "")
  .replace(/(?<!\n)\n(?!\n|[ \t]*\*)/g, " ")
  .trim();

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
  const [showChromiumLicense, setShowChromiumLicense] = createSignal(false);

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

        {/* BSD-3-Clause requires the full notice to ship with the binary, not just a link to it. */}
        <div class="space-y-1">
          <div class="text-text-primary">GPU blocklist</div>
          <div>
            Whether the app draws with your GPU is decided with{" "}
            <Link
              url={CHROMIUM_BLOCKLIST_URL}
              label="Chromium's GPU blocklist"
            />, © The Chromium Authors, licensed under BSD-3-Clause.
          </div>
          <button
            type="button"
            class="underline text-text-primary cursor-pointer"
            onClick={() => setShowChromiumLicense(!showChromiumLicense())}
          >
            {showChromiumLicense() ? "Hide license" : "Show license"}
          </button>
          <Show when={showChromiumLicense()}>
            <p class="whitespace-pre-line text-xs">{CHROMIUM_LICENSE}</p>
          </Show>
        </div>
      </div>
    </div>
  );
}
