/* @refresh reload */
import { render } from "solid-js/web";
import App from "@src/App.tsx";
import { useSettingsStore } from "@src/stores/settingsStore.ts";

(async () => {
  const [, settingsActions] = useSettingsStore();
  await settingsActions.load();
  render(() => <App />, document.getElementById("root") as HTMLElement);
})();
