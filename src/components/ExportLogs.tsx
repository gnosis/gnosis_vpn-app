import { createSignal, Match, Switch } from "solid-js";
import { save } from "@tauri-apps/plugin-dialog";
import { VPNService } from "@src/services/vpnService";
import Button from "@src/components/common/Button";

export default function ExportLogs() {
  const [loading, setLoading] = createSignal(false);
  const [savedPath, setSavedPath] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function onExport() {
    setLoading(true);
    setError(null);
    setSavedPath(null);
    try {
      const now = new Date();
      const ts = `${now.getFullYear()}${
        String(now.getMonth() + 1).padStart(2, "0")
      }${
        String(now.getDate()).padStart(
          2,
          "0",
        )
      }-${String(now.getHours()).padStart(2, "0")}${
        String(now.getMinutes()).padStart(2, "0")
      }${
        String(
          now.getSeconds(),
        ).padStart(2, "0")
      }`;
      const defaultName = `gnosis_vpn-${ts}.log.zst`;
      const dest = await save({
        defaultPath: defaultName,
        filters: [{ name: "Zstandard archive", extensions: ["zst"] }],
      });
      if (!dest) {
        setError("Export canceled");
        return;
      }
      await VPNService.compressLogs(dest);
      setSavedPath(dest);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="w-full flex flex-col mb-2 items-center justify-between">
      <Button
        size="sm"
        class="my-2"
        variant="outline"
        loading={loading()}
        onClick={onExport}
      >
        Export service logs
      </Button>
      <div class="w-full h-4 flex items-center justify-center">
        <Switch>
          <Match when={savedPath()}>
            <span class="text-xs text-slate-600 overflow-x-auto">
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
    </div>
  );
}
