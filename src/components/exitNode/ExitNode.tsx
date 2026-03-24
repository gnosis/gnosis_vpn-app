import { createMemo, createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useAppStore } from "../../stores/appStore.ts";
import { destinationLabel, selectTargetId } from "../../utils/destinations.ts";
import type { DestinationHealth } from "../../services/vpnService.ts";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import ExitHealthBadge from "./ExitHealthBadge.tsx";
import { getConnectionLabel } from "../../utils/status.ts";
import ExitNodeList from "./ExitNodeList.tsx";

export default function ExitNode() {
  const [appState] = useAppStore();
  const [settings] = useSettingsStore();
  const [showList, setShowList] = createSignal(false);

  const randomDestination = createMemo(() => {
    const available = appState.availableDestinations;
    if (available.length === 0) return null;

    const { id } = selectTargetId(
      undefined,
      settings.preferredLocation,
      available,
    );

    if (!id) return null;
    return available.find((d) => d.id === id) ?? null;
  });

  const selectedDest = createMemo(() =>
    appState.selectedId
      ? (appState.availableDestinations.find((d) =>
        d.id === appState.selectedId
      ) ?? null)
      : null
  );

  const isDisabled = () =>
    appState.isLoading || appState.vpnStatus === "ServiceUnavailable";

  return (
    <div class="w-full flex flex-row bg-bg-surface rounded-2xl p-4">
      <button
        type="button"
        class="w-full flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isDisabled()}
        onClick={() => setShowList(true)}
      >
        <div class="flex flex-col gap-0.5 items-start min-w-0">
          <span class="text-xs text-text-secondary">Exit Node</span>
          <Show
            when={selectedDest()}
            fallback={
              <Show
                when={randomDestination()}
                fallback={<span class="font-bold text-sm">Random</span>}
              >
                {(randDest) => {
                  // const ds = () => appState.destinations[randDest().id];
                  // const exitHealth = (): DestinationHealth | undefined => ds()?.exit_health;
                  // const connected = () => (ds() ? getConnectionLabel(ds()!.connection_state) === "Connected" : false);
                  return (
                    <span class="flex flex-col items-start">
                      <span class="font-bold text-sm">Random</span>
                      <span class="flex items-center gap-1.5 text-xs text-text-secondary font-light break-all">
                        {
                          /* <Show when={exitHealth()}>
                          {(eh) => (
                            <ExitHealthBadge
                              exitHealth={eh()}
                              compact
                              connected={connected()}
                            />
                          )}
                        </Show> */
                        }
                        {destinationLabel(randDest())}
                      </span>
                    </span>
                  );
                }}
              </Show>
            }
          >
            {(dest) => {
              // const ds = () => appState.destinations[dest().id];
              // const exitHealth = (): DestinationHealth | undefined => ds()?.exit_health;
              // const connected = () => (ds() ? getConnectionLabel(ds()!.connection_state) === "Connected" : false);
              return (
                <span class="flex items-center gap-1.5">
                  {
                    /* <Show when={exitHealth()}>
                    {eh => <ExitHealthBadge exitHealth={eh()} compact connected={connected()} />}
                  </Show> */
                  }
                  <span class="break-all text-sm">
                    {destinationLabel(dest())}
                  </span>
                </span>
              );
            }}
          </Show>
        </div>

        {/* Chevron right */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-4 w-4 shrink-0 text-text-secondary"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      <Show when={showList()}>
        <Portal>
          <ExitNodeList onClose={() => setShowList(false)} />
        </Portal>
      </Show>
    </div>
  );
}
