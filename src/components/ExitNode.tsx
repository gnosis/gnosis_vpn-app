import { useAppStore } from "../stores/appStore.ts";
import { Dropdown } from "./common/Dropdown.tsx";
import {
  formatDestination,
  selectTargetAddress,
} from "../utils/destinations.ts";
import type {
  Destination,
  DestinationState,
  Health,
} from "../services/vpnService.ts";
import { shortAddress } from "../utils/shortAddress.ts";
import { createMemo } from "solid-js";
import { useSettingsStore } from "../stores/settingsStore.ts";
import NodeStatus from "./NodeStatus.tsx";

export default function ExitNode() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();
  type RandomOption = { type: "random" };
  type ExitOption = Destination | RandomOption;

  const stateByAddress = createMemo(() => {
    const map = new Map<string, DestinationState>();
    for (const ds of appState.destinations as DestinationState[]) {
      map.set(ds.destination.address, ds);
    }
    return map;
  });

  const randomDestination = createMemo(() => {
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
          { type: "random" } as RandomOption,
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
              <span>Random</span>
            </div>
          );
        }}
        value={(appState.selectedAddress
          ? (appState.availableDestinations.find((d) =>
            d.address === appState.selectedAddress
          ) ??
            ({ type: "random" } as RandomOption))
          : ({ type: "random" } as RandomOption)) as ExitOption}
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
          return "Random";
        }}
        isOptionDisabled={(opt: ExitOption) => {
          if ("address" in opt) {
            const ds = stateByAddress().get(opt.address);
            const health = ds?.health?.health;
            return health !== "ReadyToConnect";
          }
          return false;
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
          const randomDest = randomDestination();
          if (randomDest) {
            const destName = formatDestination(randomDest) ||
              shortAddress(randomDest.address);
            const ds = stateByAddress().get(randomDest.address);
            const cs = ds?.connection_state;
            const health: Health | undefined = ds?.health?.health as
              | Health
              | undefined;
            return (
              <span class="flex flex-col">
                <span>
                  <span class="font-bold">Random</span>{" "}
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
              <span class="font-bold">Random</span>
            </span>
          );
        }}
        placeholder="Random"
        disabled={appState.isLoading ||
          appState.vpnStatus === "ServiceUnavailable"}
      />
    </div>
  );
}
