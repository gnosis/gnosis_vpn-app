import { useAppStore } from "../../stores/appStore.ts";
import {
  destinationLabel,
  destinationLabelById,
  resolveAutoDestination,
} from "../../utils/destinations.ts";
import { createMemo, createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import ExitNodeList from "./ExitNodeList.tsx";
import Flag from "../Flag.tsx";

export default function ExitNode() {
  const [appState] = useAppStore();
  const [settings] = useSettingsStore();

  const [showList, setShowList] = createSignal(false);

  const resolvedAutoDestination = createMemo(() =>
    resolveAutoDestination(
      appState.availableDestinations,
      appState.destinations,
      settings.preferredLocation,
    )
  );

  return (
    <>
      <button
        type="button"
        aria-label="Select Exit Node"
        class="w-full flex flex-row items-center justify-between gap-2 bg-bg-surface hover:bg-bg-surface-alt rounded-2xl p-4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        onClick={() => setShowList(true)}
        disabled={appState.isLoading ||
          appState.vpnStatus === "ServiceUnavailable"}
      >
        <div class="flex flex-col items-start min-w-0 text-left">
          <span class="text-xs text-text-secondary">Exit Node</span>
          <Show
            when={appState.selectedId}
            fallback={
              <Show
                when={resolvedAutoDestination()}
                fallback={
                  <span class="text-sm font-medium text-text-primary">
                    Auto
                  </span>
                }
              >
                {(dest) => (
                  <span class="flex flex-col">
                    <span class="text-sm font-medium text-text-primary">
                      Auto
                    </span>
                    <span class="flex items-center gap-1.5 text-xs text-text-secondary min-w-0">
                      <Flag code={dest().meta.flag ?? ""} />
                      <span class="break-all">{destinationLabel(dest())}</span>
                    </span>
                  </span>
                )}
              </Show>
            }
          >
            {(selectedId) => {
              const dest = () =>
                appState.availableDestinations.find(
                  (d) => d.id === selectedId(),
                );
              return (
                <span class="flex items-center gap-1.5 text-sm font-medium text-text-primary min-w-0">
                  <Flag code={dest()?.meta.flag ?? ""} />
                  <span class="break-all">
                    {destinationLabelById(
                      selectedId(),
                      appState.availableDestinations,
                    )}
                  </span>
                </span>
              );
            }}
          </Show>
        </div>
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

      <Portal>
        <Show when={showList()}>
          <ExitNodeList onClose={() => setShowList(false)} />
        </Show>
      </Portal>
    </>
  );
}
