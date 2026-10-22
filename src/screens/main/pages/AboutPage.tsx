import { createResource, createSignal, Show } from "solid-js";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Row, Section } from "@src/components/common/GroupedList.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { logWarn } from "@src/utils/appLog.ts";

const SOURCE_URL = "https://github.com/gnosis/gnosis_vpn-app";
const IPINFO_URL = "https://ipinfo.io";
const FLAG_ICONS_URL = "https://github.com/lipis/flag-icons";

// Seven quick clicks on the version reveal the component versions.
const REVEAL_CLICKS = 7;
const REVEAL_WINDOW_MS = 2000;

async function open(url: string) {
  try {
    await openUrl(url);
  } catch (e) {
    logWarn(`Failed to open ${url}: ${e}`);
  }
}

function ExternalMark() {
  return <span aria-hidden="true">↗</span>;
}

/** About Gnosis VPN: version, licence, source, and the third-party notices. */
export default function AboutPage() {
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
    <>
      <Section title="Gnosis VPN">
        <div onClick={handleVersionClick}>
          <Row
            label="Version"
            control={
              <span class="select-text text-text-primary">
                {appState.packageVersion ?? "Something went wrong"}
              </span>
            }
          />
        </div>
        <Show when={showVersionDetails()}>
          <Row
            label="Service version"
            control={
              <span class="select-text">
                {appState.serviceInfo?.version ?? "—"}
              </span>
            }
          />
          <Row
            label="App version"
            control={<span class="select-text">{appVersion() ?? "—"}</span>}
          />
          <Row
            label="Toolkit version"
            control={
              <span class="select-text">{appState.toolkit.version ?? "—"}</span>
            }
          />
        </Show>
        <Row label="License" control={<span>GPL-3.0</span>} />
        <Row
          label="Source code"
          control={<ExternalMark />}
          onClick={() => void open(SOURCE_URL)}
        />
      </Section>

      {/* CC BY-SA 4.0 attribution; the offline note keeps users from assuming their IP goes to IPinfo. */}
      <Section title="Third-party notices">
        <Row
          label="IPinfo"
          description={
            <>
              Exit countries come from an offline database on this device.
              Nothing is sent to IPinfo. IP address data is powered by IPinfo,
              licensed under CC BY-SA 4.0.
            </>
          }
          control={<ExternalMark />}
          onClick={() => void open(IPINFO_URL)}
        />
        <Row
          label="Flag art"
          description="Flags from flag-icons, licensed under MIT."
          control={<ExternalMark />}
          onClick={() => void open(FLAG_ICONS_URL)}
        />
      </Section>
    </>
  );
}
