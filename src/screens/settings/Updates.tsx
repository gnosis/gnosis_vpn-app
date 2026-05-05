import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Toggle from "@src/components/common/Toggle.tsx";
import UpdateStatusCard from "@src/components/common/UpdateStatusCard.tsx";
import ChannelSelector from "@src/components/common/ChannelSelector.tsx";
import CheckUpdateModal from "@src/components/CheckUpdateModal.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore, type UpdateChannel, type UpdateManifest } from "@src/stores/settingsStore.ts";

function detectChannel(version: string): UpdateChannel {
  return version.includes("-") || version.includes("+") ? "snapshot" : "stable";
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const withoutPre = v.split("-")[0];
    const [core, buildTag] = withoutPre.split("+");
    const nums = core.split(".").map(Number);
    const build = buildTag ? Number(buildTag.replace("build.", "")) : -1;
    return { nums, build };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return pa.build - pb.build;
}

export default function Updates() {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  const [showCheckModal, setShowCheckModal] = createSignal(false);
  const [checking, setChecking] = createSignal(false);
  const [pendingCheckAfterConnect, setPendingCheckAfterConnect] = createSignal(false);

  createEffect(() => {
    if (pendingCheckAfterConnect() && appState.vpnStatus === "Connected") {
      setPendingCheckAfterConnect(false);
      void runCheck(false);
    }
  });

  const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

  // Check immediately when auto-check is turned on
  createEffect(on(() => settings.updateCheck, (enabled) => {
    if (!enabled) return;
    if (appState.vpnStatus === "Connected") {
      void runCheck(false);
    } else {
      setPendingCheckAfterConnect(true);
    }
  }, { defer: true }));

  // Reschedule 24h after each completed check
  createEffect(() => {
    if (!settings.updateCheck || settings.lastCheckedAt == null) return;

    const delay = Math.max(0, settings.lastCheckedAt + AUTO_CHECK_INTERVAL_MS - Date.now());

    const id = setTimeout(() => {
      if (checking()) return;
      if (appState.vpnStatus === "Connected") {
        void runCheck(false);
      } else {
        setPendingCheckAfterConnect(true);
      }
    }, delay);

    onCleanup(() => clearTimeout(id));
  });

  const runCheck = async (skipVpn: boolean) => {
    setChecking(true);
    try {
      const manifest = await invoke<UpdateManifest>("check_update", { skipVpn });
      await settingsActions.setUpdateCheckResult(manifest, Date.now());
    } catch (e) {
      if (e === "VpnNotConnected") {
        setShowCheckModal(true);
      }
      // TODO: surface other errors
    } finally {
      setChecking(false);
    }
  };

  const packageVersion = createMemo(() => appState.serviceInfo?.package_version ?? null);

  const effectiveChannel = createMemo<UpdateChannel>(() => {
    if (settings.channel) return settings.channel;
    const ver = packageVersion();
    return ver ? detectChannel(ver) : "stable";
  });

  createEffect(() => {
    if (!settings.channel && packageVersion()) {
      void settingsActions.setChannel(detectChannel(packageVersion()!));
    }
  });

  const latestVersion = createMemo(() =>
    settings.updateManifest?.channels[effectiveChannel()]?.version
  );

  const isUpToDate = createMemo<boolean | undefined>(() => {
    const pkgVer = packageVersion();
    const latest = latestVersion();
    if (!latest || !pkgVer) return undefined;
    if (detectChannel(pkgVer) !== effectiveChannel()) return false;
    return compareVersions(pkgVer, latest) >= 0;
  });

  const formatCheckedAt = (epoch: number) => {
    const d = new Date(epoch);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleCheck = () => void runCheck(false);

  onMount(() => {
    let disposed = false;
    void listen("updates:check", () => handleCheck()).then((unlisten) => {
      if (disposed) unlisten();
      else onCleanup(unlisten);
    });
    onCleanup(() => { disposed = true; });
  });

  const handleCheckAnyway = () => {
    setShowCheckModal(false);
    void runCheck(true);
  };

  const handleConnectAndCheck = () => {
    setShowCheckModal(false);
    setPendingCheckAfterConnect(true);
    void appActions.connect();
  };

  return (
    <div class="space-y-4 w-full p-6 max-w-lg bg-bg-primary select-none flex flex-col h-full">
      <UpdateStatusCard
        onCheck={handleCheck}
        loading={checking()}
        isUpToDate={isUpToDate()}
        latestVersion={latestVersion()}
        releaseNotes={settings.updateManifest?.channels[effectiveChannel()]?.release_notes}
        lastChecked={settings.lastCheckedAt != null
          ? formatCheckedAt(settings.lastCheckedAt)
          : undefined}
      />
      <CheckUpdateModal
        open={showCheckModal()}
        onClose={() => setShowCheckModal(false)}
        onCheckAnyway={handleCheckAnyway}
        onConnectAndCheck={handleConnectAndCheck}
      />
      <Toggle
        label="Automatic update check"
        checked={settings.updateCheck}
        onChange={(e) =>
          void settingsActions.setUpdateCheck(e.currentTarget.checked)}
        description="Done only when connected through the Gnosis VPN"
      />
      <ChannelSelector
        value={effectiveChannel()}
        onChange={(ch) => void settingsActions.setChannel(ch)}
      />
      <div class="grow" />
      <div class="space-y-1 text-sm text-text-secondary text-center">
        <div>
          Package version:{" "}
          <span class="text-text-primary">
            {appState.serviceInfo?.package_version ?? "—"}
          </span>
        </div>
        <div class="text-xs">
          Service version:{" "}
          <span class="text-text-primary">
            {appState.serviceInfo?.version ?? "—"}
          </span>
        </div>
        <div class="text-xs">
          App version:{" "}
          <span class="text-text-primary">{appState.appVersion ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}
