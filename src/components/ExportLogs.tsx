import { createSignal, Match, Switch } from "solid-js";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir, join } from "@tauri-apps/api/path";
import { VPNService } from "../services/vpnService.ts";
import { logInfo } from "@src/utils/appLog.ts";
import { logBundleFileName } from "@src/utils/logBundle.ts";
import Button from "./common/Button.tsx";
import UploadLogsModal from "./UploadLogsModal.tsx";

export default function ExportLogs() {
  const [loading, setLoading] = createSignal(false);
  const [showUpload, setShowUpload] = createSignal(false);
  const [savedPath, setSavedPath] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function onExport() {
    setLoading(true);
    setError(null);
    setSavedPath(null);
    try {
      const downloadsPath = await downloadDir();
      const defaultPath = await join(downloadsPath, logBundleFileName());
      const dest = await save({
        defaultPath,
        filters: [{ name: "Zstandard archive", extensions: ["zst"] }],
      });
      if (!dest) {
        logInfo("Log export canceled in save dialog");
        setError("Export canceled");
        return;
      }
      setSavedPath(await VPNService.exportLogs(dest));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  function openUpload() {
    setError(null);
    setSavedPath(null);
    setShowUpload(true);
  }

  return (
    <div class="w-full flex flex-col mb-2 items-center justify-between">
      <div class="w-full flex gap-2 my-2">
        <Button
          size="sm"
          variant="outline"
          loading={loading()}
          onClick={onExport}
        >
          Export logs
        </Button>
        <Button size="sm" variant="outline" onClick={openUpload}>
          Upload logs
        </Button>
      </div>
      <div class="w-full h-4 flex items-center justify-center">
        <Switch>
          <Match when={savedPath()}>
            <span class="text-xs text-text-secondary overflow-x-auto">
              Saved to: <span class="font-mono">{savedPath()}</span>
            </span>
          </Match>
          <Match when={error()}>
            <span class="text-xs text-red-600">{error()}</span>
          </Match>
          <Match when>
            <span class="text-xs invisible">-</span>
          </Match>
        </Switch>
      </div>
      <UploadLogsModal
        open={showUpload()}
        onClose={() => setShowUpload(false)}
      />
    </div>
  );
}
