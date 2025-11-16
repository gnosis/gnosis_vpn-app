import { useAppStore } from "@src/stores/appStore";
import { Dropdown } from "@src/components/common/Dropdown";
import {
  formatDestination,
  selectTargetAddress,
} from "@src/utils/destinations";
import type {
  Destination,
  DestinationState,
  Health,
} from "@src/services/vpnService";
import { shortAddress } from "@src/utils/shortAddress";
import { createMemo } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore";
import NodeStatus from "@src/components/NodeStatus";

export default function ExitNode() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();
  type DefaultOption = { type: "default" };
  type ExitOption = Destination | DefaultOption;

  const stateByAddress = createMemo(() => {
    const map = new Map<string, DestinationState>();
    for (const ds of appState.destinations as DestinationState[]) {
      map.set(ds.destination.address, ds);
    }
    return map;
  });

  const defaultDestination = createMemo(() => {
    const available = appState.availableDestinations;
    if (available.length === 0) return null;

    const { address } = selectTargetAddress(
      undefined,
      settings.preferredLocation,
      available,
    );

    if (!address) return null;
    const df = available.find((d) => d.address === address) ?? null;
    return df;
  });

  return (
    <div class="w-full flex flex-row bg-white rounded-2xl p-4">
      <Dropdown<ExitOption>
        label="Exit Node"
        options={[
          { type: "default" } as DefaultOption,
          ...appState.availableDestinations,
        ]}
        renderOption={(opt: ExitOption) => {
          if ("address" in opt) {
            const name = formatDestination(opt) || shortAddress(opt.address);
            const ds = stateByAddress().get(opt.address);
            const cs = ds?.connection_state;
            const health: Health | undefined = ds?.health?.health as
              | Health
              | undefined;
            return (
              <div class="flex flex-col">
                <span>{name}</span>
                <NodeStatus connectionState={cs} health={health} />
              </div>
            );
          }
          return (
            <div class="flex flex-col">
              <span class="font-bold">Default</span>
            </div>
          );
        }}
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
            appActions.chooseDestination(opt.address);
          } else {
            if (current !== null) {
              appActions.chooseDestination(null);
            }
          }
        }}
        itemToString={(opt: ExitOption) => {
          if ("address" in opt) {
            const name = formatDestination(opt) || shortAddress(opt.address);
            return name;
          }
          return "Default";
        }}
        renderValue={(opt: ExitOption) => {
          if ("address" in opt) {
            const name = formatDestination(opt) || shortAddress(opt.address);
            const ds = stateByAddress().get(opt.address);
            const cs = ds?.connection_state;
            const health: Health | undefined = ds?.health?.health as
              | Health
              | undefined;
            return (
              <span class="flex flex-col">
                <span>{name}</span>
                <NodeStatus connectionState={cs} health={health} />
              </span>
            );
          }
          const defaultDest = defaultDestination();
          if (defaultDest) {
            const destName = formatDestination(defaultDest) ||
              shortAddress(defaultDest.address);
            const ds = stateByAddress().get(defaultDest.address);
            const cs = ds?.connection_state;
            const health: Health | undefined = ds?.health?.health as
              | Health
              | undefined;
            return (
              <span class="flex flex-col">
                <span>
                  <span class="font-bold">Default</span>{" "}
                  <span class="text-sm text-gray-500 font-light">
                    {destName}
                  </span>
                </span>
                <NodeStatus connectionState={cs} health={health} />
              </span>
            );
          }
          return (
            <span class="flex flex-col">
              <span class="font-bold">Default</span>
            </span>
          );
        }}
        placeholder="Default"
        disabled={appState.isLoading ||
          appState.vpnStatus === "ServiceUnavailable"}
      />
    </div>
  );
}
