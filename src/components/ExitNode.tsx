import { useAppStore } from "../stores/appStore.ts";
import { Dropdown } from "./common/Dropdown.tsx";
import { formatDestination } from "../utils/destinations.ts";
import type { Destination } from "../services/vpnService.ts";
import { shortAddress } from "../utils/shortAddress.ts";

export default function ExitNode() {
  const [appState, appActions] = useAppStore();
  type DefaultOption = { type: "default" };
  type ExitOption = Destination | DefaultOption;

  return (
    <div class="w-full flex flex-row bg-white rounded-2xl p-4">
      <Dropdown<ExitOption>
        label="Exit Node"
        options={[{ type: "default" } as DefaultOption, ...appState.availableDestinations]}
        value={
          (appState.selectedAddress
            ? (appState.availableDestinations.find(d => d.address === appState.selectedAddress) ??
              ({ type: "default" } as DefaultOption))
            : ({ type: "default" } as DefaultOption)) as ExitOption
        }
        onChange={(opt: ExitOption) => {
          if ("address" in opt) {
            appActions.chooseDestination(opt.address);
          } else {
            appActions.chooseDestination(null);
          }
        }}
        itemToString={(opt: ExitOption) => {
          if ("address" in opt) {
            const name = formatDestination(opt);
            return name && name.length > 0 ? name : shortAddress(opt.address);
          }
          return "Default";
        }}
        placeholder="Default"
        disabled={appState.isLoading || appState.connectionStatus === "ServiceUnavailable"}
      />
    </div>
  );
}
