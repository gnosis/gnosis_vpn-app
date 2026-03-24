import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { destinationLabel, selectTargetId } from "@src/utils/destinations.ts";
import { getConnectionLabel } from "@src/utils/status.ts";
import { getHealthScore } from "@src/utils/exitHealth.ts";
import { isReadyToConnect, VPNService } from "@src/services/vpnService.ts";
import Button from "../common/Button.tsx";
import ExitNodeCard from "./ExitNodeCard.tsx";

export default function ExitNodeList(props: { onClose: () => void }) {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();

  const [query, setQuery] = createSignal("");
  const [pendingId, setPendingId] = createSignal<string | null>(null);

  let containerRef: HTMLDivElement | undefined;
  onMount(() => containerRef?.focus());

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (pendingId() !== null) {
        setPendingId(null);
      } else {
        props.onClose();
      }
    }
  }

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

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

  const filtered = createMemo(() => {
    const q = query().toLowerCase();
    if (!q) return sortedDestinations();
    return sortedDestinations().filter((d) =>
      destinationLabel(d).toLowerCase().includes(q)
    );
  });

  const pendingDest = createMemo(() => {
    const id = pendingId();
    if (!id) return null;
    return appState.availableDestinations.find((d) => d.id === id) ?? null;
  });

  const handleSelectRandom = () => {
    appActions.chooseDestination(null);
    props.onClose();
  };

  const handleCardClick = (id: string) => {
    const ds = appState.destinations[id];
    if (!ds) return;
    const isConnected = getConnectionLabel(ds.connection_state) === "Connected";
    const ready = isReadyToConnect(ds.connectivity.health);
    const eh = ds.exit_health;
    const hasReachableExit = typeof eh === "object" && "Success" in eh &&
      eh.Success.health.slots.available > 0;
    if (!isConnected && !(ready && hasReachableExit)) return;

    const vpnActive = appState.vpnStatus === "Connected" ||
      appState.vpnStatus === "Connecting";
    if (vpnActive) {
      setPendingId(id);
    } else {
      appActions.chooseDestination(id);
      props.onClose();
    }
  };

  const handleConfirmSwitch = async () => {
    const id = pendingId();
    if (id) {
      appActions.chooseDestination(id);
      try {
        await VPNService.connect(id);
      } catch (error) {
        console.error("Failed to switch node:", error);
      }
    }
    setPendingId(null);
    props.onClose();
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      class="fixed inset-0 z-100 bg-bg-primary flex flex-col outline-none"
    >
      {/* Header */}
      <div class="flex items-center gap-2 px-3 py-3 border-b border-border shrink-0">
        <button
          type="button"
          class="rounded-md p-1 hover:bg-bg-surface"
          aria-label="Back"
          onClick={() => props.onClose()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="h-5 w-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h1 class="text-text-primary text-lg font-medium">Exit Node</h1>
      </div>

      {/* Search */}
      <div class="px-3 py-2 shrink-0">
        <input
          type="text"
          placeholder="Search for Location or Exit Node"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          class="w-full bg-bg-surface rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-1 focus:ring-text-secondary"
        />
      </div>

      {/* List */}
      <div class="flex-1 overflow-y-auto pb-3 flex flex-col gap-1">
        {/* Random option */}
        <Show when={!query()}>
          <div
            class={`w-full bg-bg-surface-alt px-4 py-3 cursor-pointer hover:bg-bg-surface transition-colors ${
              appState.selectedId === null ? "border-b border-border" : ""
            }`}
            onClick={handleSelectRandom}
            role="button"
          >
            <div class="flex flex-col">
              <span class="font-semibold text-sm text-text-primary">
                Random
              </span>
              <Show when={randomDestination()}>
                {(dest) => (
                  <span class="text-xs text-text-secondary break-all">
                    {destinationLabel(dest())}
                  </span>
                )}
              </Show>
            </div>
          </div>
        </Show>

        <For each={filtered()}>
          {(dest) => {
            const ds = () => appState.destinations[dest.id];
            return (
              <Show when={ds()}>
                {(destState) => (
                  <ExitNodeCard
                    destinationState={destState()}
                    isSelected={appState.selectedId === dest.id}
                    onClick={() => handleCardClick(dest.id)}
                  />
                )}
              </Show>
            );
          }}
        </For>
      </div>

      {/* Switch confirmation — inline overlay, stays within z-100 stacking context */}
      <Show when={pendingId() !== null}>
        <div
          class="absolute inset-0 bg-bg-overlay backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setPendingId(null)}
        >
          <div
            class="w-full max-w-sm bg-bg-surface rounded-lg shadow-xl ring-1 ring-black/10 px-5 py-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div class="flex flex-col gap-4">
              <p class="text-text-primary text-sm">
                Switch to{" "}
                <span class="font-semibold">
                  {pendingDest()
                    ? destinationLabel(pendingDest()!)
                    : "this node"}
                </span>?
              </p>
              <div class="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPendingId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleConfirmSwitch()}
                >
                  Switch
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
