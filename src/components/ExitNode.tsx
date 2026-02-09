import { useAppStore } from "../stores/appStore.ts";
import { Dropdown } from "./common/Dropdown.tsx";
import { selectTargetId } from "../utils/destinations.ts";
import type { Destination, DestinationHealth } from "../services/vpnService.ts";
import { shortAddress } from "../utils/shortAddress.ts";
import { createMemo } from "solid-js";
import { useSettingsStore } from "../stores/settingsStore.ts";
import ExitHealthBadge from "./ExitHealthBadge.tsx";
import { getHealthScore } from "../utils/exitHealth.ts";

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

  const sortedDestinations = createMemo(() => {
    const dests = [...appState.availableDestinations];
    dests.sort((a, b) => {
      const dsA = appState.destinations[a.id];
      const dsB = appState.destinations[b.id];
      if (!dsA && !dsB) return 0;
      if (!dsA) return 1;
      if (!dsB) return -1;
      return getHealthScore(dsB) - getHealthScore(dsA);
    });
    return dests;
  });

  return (
    <div class="w-full flex flex-row bg-bg-surface rounded-2xl p-4">
      <Dropdown<ExitOption>
        label="Exit Node"
        options={[
          { type: "random" } as RandomOption,
          ...sortedDestinations(),
        ]}
        renderOption={(opt: ExitOption) => {
          if ("id" in opt) {
            const name = shortAddress(opt.id);
            const ds = appState.destinations[opt.id];
            const exitHealth: DestinationHealth | undefined = ds?.exit_health;
            return (
              <span class="flex items-center justify-between gap-2">
                <span class="flex items-center gap-1.5 min-w-0">
                  {exitHealth && (
                    <ExitHealthBadge exitHealth={exitHealth} compact />
                  )}
                  <span class="truncate">{name}</span>
                </span>
                {exitHealth && (
                  <span class="shrink-0">
                    <ExitHealthBadge exitHealth={exitHealth} hideDot />
                  </span>
                )}
              </span>
            );
          }
          return <span>Random</span>;
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
            return shortAddress(opt.id);
          }
          return "Random";
        }}
        isOptionDisabled={() => false}
        renderValue={(opt: ExitOption) => {
          if ("id" in opt) {
            const name = shortAddress(opt.id);
            const ds = appState.destinations[opt.id];
            const exitHealth: DestinationHealth | undefined = ds?.exit_health;
            return (
              <span class="flex items-center gap-1.5">
                {exitHealth && (
                  <ExitHealthBadge exitHealth={exitHealth} compact />
                )}
                <span>{name}</span>
              </span>
            );
          }
          const randomDest = randomDestination();
          if (randomDest) {
            const destName = shortAddress(randomDest.id);
            const ds = appState.destinations[randomDest.id];
            const exitHealth: DestinationHealth | undefined = ds?.exit_health;
            return (
              <span class="flex items-center gap-1.5">
                {exitHealth && (
                  <ExitHealthBadge exitHealth={exitHealth} compact />
                )}
                <span>
                  <span class="font-bold">Random</span>
                  <span class="text-sm text-text-secondary font-light ml-2">
                    {destName}
                  </span>
                </span>
              </span>
            );
          }
          return <span class="font-bold">Random</span>;
        }}
        placeholder="Random"
        disabled={appState.isLoading ||
          appState.vpnStatus === "ServiceUnavailable"}
      />
    </div>
  );
}
