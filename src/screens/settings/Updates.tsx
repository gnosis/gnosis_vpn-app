import { createEffect, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import Toggle from "@src/components/common/Toggle.tsx";
import UpdateStatusCard from "@src/components/common/UpdateStatusCard.tsx";
import CheckUpdateModal from "@src/components/CheckUpdateModal.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore, type UpdateManifest } from "@src/stores/settingsStore.ts";

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
