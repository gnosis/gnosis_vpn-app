/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import { useSettingsStore } from "./stores/settingsStore";

(async () => {
  const [, settingsActions] = useSettingsStore();
  await settingsActions.load();
  render(() => <App />, document.getElementById("root") as HTMLElement);
})();
