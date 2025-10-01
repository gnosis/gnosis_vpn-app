import { useAppStore } from "@src/stores/appStore";
import { Dropdown } from "@src/components/common/Dropdown";
import { formatDestination } from "@src/utils/destinations";
import type { Destination } from "@src/services/vpnService";
import { shortAddress } from "@src/utils/shortAddress";
import { createSignal } from "solid-js";
import ExitNodeWarning from "@src/components/ExitNodeWarning";

export default function ExitNode() {
  const [appState, appActions] = useAppStore();
  type DefaultOption = { type: "default" };
  type ExitOption = Destination | DefaultOption;

  const [openModal, setOpenModal] = createSignal(false);
  const [pendingSelection, setPendingSelection] = createSignal<
    Destination | null
  >(null);

  return (
    <>
      <div class="w-full flex flex-row bg-white rounded-2xl p-4">
        <Dropdown<ExitOption>
          label="Exit Node"
          options={[
            { type: "default" } as DefaultOption,
            ...appState.availableDestinations,
          ]}
          value={(appState.selectedAddress
            ? (appState.availableDestinations.find((d) =>
              d.address === appState.selectedAddress
            ) ??
              ({ type: "default" } as DefaultOption))
            : ({ type: "default" } as DefaultOption)) as ExitOption}
          onChange={(opt: ExitOption) => {
            const current = appState.selectedAddress;
            if ("address" in opt) {
              if (current === opt.address) {
                return;
              }
              setPendingSelection(opt);
              setOpenModal(true);
            } else {
              if (current !== null) {
                appActions.chooseDestination(null);
              }
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
          disabled={appState.isLoading ||
            appState.connectionStatus === "ServiceUnavailable"}
        />
      </div>
      <ExitNodeWarning
        open={openModal()}
        onCancel={() => setOpenModal(false)}
        onProceed={() => {
          const dest = pendingSelection();
          if (dest) appActions.chooseDestination(dest.address);
          setOpenModal(false);
          setPendingSelection(null);
        }}
      />
    </>
  );
}
