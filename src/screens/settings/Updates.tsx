import { createEffect, createMemo, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import Toggle from "@src/components/common/Toggle.tsx";
import UpdateStatusCard from "@src/components/common/UpdateStatusCard.tsx";
import CheckUpdateModal from "@src/components/CheckUpdateModal.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore, type UpdateChannel, type UpdateManifest } from "@src/stores/settingsStore.ts";

function detectChannel(version: string): UpdateChannel {
  return version.includes("-") ? "snapshot" : "stable";
}

function compareVersions(a: string, b: string): number {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
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

  const effectiveChannel = createMemo<UpdateChannel>(() => {
    if (settings.channel) return settings.channel;
    const ver = appState.appVersion;
    return ver ? detectChannel(ver) : "stable";
  });

  createEffect(() => {
    if (!settings.channel && appState.appVersion) {
      void settingsActions.setChannel(detectChannel(appState.appVersion));
    }
  });

  const isUpToDate = createMemo<boolean | undefined>(() => {
    const manifest = settings.updateManifest;
    const appVer = appState.appVersion;
    if (!manifest || !appVer) return undefined;
    const latest = manifest.channels[effectiveChannel()]?.version;
    if (!latest) return undefined;
    return compareVersions(appVer, latest) >= 0;
  });

  const formatCheckedAt = (epoch: number) => {
    const d = new Date(epoch);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleCheck = () => void runCheck(false);

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
