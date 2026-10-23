import { onCleanup, onMount } from "solid-js";
import { useAppStore } from "@src/stores/appStore.ts";
import { getPlatform } from "@src/utils/platform.ts";
import {
  primaryActionEnabled,
  runPrimaryAction,
} from "@src/utils/primaryAction.ts";
import { currentPage, push } from "@src/stores/pageStack.ts";
import { isControl, resolveMainShortcut } from "@src/utils/shortcuts.ts";
import { isSwitchingDestination } from "@src/utils/status.ts";

/**
 * The main screen's keyboard shortcuts, shown nowhere in the UI. The picker
 * handles its own keys (in the capture phase) while it is open.
 */
export function createMainShortcuts(opts: { openPicker: () => void }): void {
  const [appState, appActions] = useAppStore();

  let isMac = false;
  void getPlatform().then((platform) => {
    isMac = platform === "macos";
  });

  const connecting = () => {
    const status = appState.vpnStatus;
    return status === "Connecting" || status === "Reconnecting" ||
      isSwitchingDestination(status, appState.targetDestination);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const action = resolveMainShortcut(e, {
      isMac,
      controlFocused: isControl(document.activeElement),
      pickerOpen: appState.mode.listOpen,
      connecting: connecting(),
    });
    if (!action) return;
    // A page replaces the main content, and its keys with it; only the Settings chord still applies.
    if (currentPage() !== null && action !== "settings") return;
    e.preventDefault();
    switch (action) {
      case "primary":
        if (primaryActionEnabled(appState)) {
          void runPrimaryAction(appState, appActions);
        }
        return;
      case "picker":
        if (appState.mode.listOpen) appActions.destinationListClosed(null);
        else opts.openPicker();
        return;
      case "settings":
        push("settings");
        return;
      case "cancel":
        void appActions.disconnect();
        return;
    }
  };

  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));
}
