import { useAppStore } from "../stores/appStore.ts";
import { Dropdown } from "./common/Dropdown.tsx";
import { formatDestination } from "../utils/destinations.ts";
import type { Destination } from "../services/vpnService.ts";

export default function ExitNode() {
  const [appState, appActions] = useAppStore();

  return (
    <div class="w-full flex flex-row bg-white rounded-2xl p-4">
      <Dropdown
        label="Exit Node"
        options={appState.availableDestinations}
        value={appState.destination as Destination | null}
        onChange={(d: Destination) => appActions.chooseDestination(d.address)}
        itemToString={(d: Destination) => formatDestination(d)}
        placeholder="Default"
      />
    </div>
  );
}
