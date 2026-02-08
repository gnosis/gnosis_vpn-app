import { useAppStore } from "../stores/appStore.ts";
import { Dropdown } from "./common/Dropdown.tsx";
import { formatDestination, selectTargetId } from "../utils/destinations.ts";
import type { Destination, Health } from "../services/vpnService.ts";
import { shortAddress } from "../utils/shortAddress.ts";
import { createMemo } from "solid-js";
import { useSettingsStore } from "../stores/settingsStore.ts";
import NodeStatus from "./NodeStatus.tsx";

type RandomOption = { type: "random" };
type ExitOption = Destination | RandomOption;

export default function ExitNode() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();

  const randomDestination = createMemo(() => {
    const available = appState.availableDestinations;
    if (available.length === 0) return null;

    const { id } = selectTargetId(
      undefined,
      settings.preferredLocation,
      available,
    );

    if (!id) return null;
    const df = available.find((d) => d.id === id) ?? null;
    return df;
  });

  return (
    <div class="w-full flex flex-row bg-bg-surface rounded-2xl p-4">
      <Dropdown<ExitOption>
        label="Exit Node"
        options={[
          { type: "random" } as RandomOption,
          ...appState.availableDestinations,
        ]}
        renderOption={(opt: ExitOption) => {
          if ("id" in opt) {
            const name = formatDestination(opt) || shortAddress(opt.address);
            const ds = appState.destinations[opt.id];
            const cs = ds?.connection_state;
            const health: Health | undefined = ds?.connectivity?.health as
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
        value={(appState.selectedId
          ? (appState.availableDestinations.find((d) =>
            d.id === appState.selectedId
          ) ??
            ({ type: "random" } as RandomOption))
          : ({ type: "random" } as RandomOption)) as ExitOption}
        onChange={(opt: ExitOption) => {
          const current = appState.selectedId;
          if ("id" in opt) {
            if (current === opt.id) {
              return;
            }
            appActions.chooseDestination(opt.id);
          } else {
            if (current !== null) {
              appActions.chooseDestination(null);
            }
          }
        }}
        itemToString={(opt: ExitOption) => {
          if ("id" in opt) {
            const name = formatDestination(opt) || shortAddress(opt.address);
            return name;
          }
          return "Random";
        }}
        isOptionDisabled={(opt: ExitOption) => {
          if ("id" in opt) {
            const ds = appState.destinations[opt.id];
            const health = ds?.connectivity?.health;
            return health !== "ReadyToConnect";
          }
          return false;
        }}
        renderValue={(opt: ExitOption) => {
          if ("id" in opt) {
            const name = formatDestination(opt) || shortAddress(opt.address);
            const ds = appState.destinations[opt.id];
            const cs = ds?.connection_state;
            const health: Health | undefined = ds?.connectivity?.health as
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
            const ds = appState.destinations[randomDest.id];
            const cs = ds?.connection_state;
            const health: Health | undefined = ds?.connectivity?.health as
              | Health
              | undefined;
            return (
              <span class="flex flex-col">
                <span>
                  <span class="font-bold">Random</span>
                  <span class="text-sm text-text-secondary font-light ml-2">
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
