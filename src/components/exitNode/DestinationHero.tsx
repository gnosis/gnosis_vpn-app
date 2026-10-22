import { createMemo, createSignal, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { effectiveActive } from "@src/stores/destinationMode.ts";
import { connectProgress } from "@src/utils/connectPhase.ts";
import {
  destinationCountry,
  destinationDescription,
  destinationName,
  destinationTitle,
  isConfigOnly,
  isConfigPinned,
} from "@src/utils/destinations.ts";
import { isSwitchingDestination } from "@src/utils/status.ts";
import Flag from "../Flag.tsx";
import GlobeIcon from "../icons/GlobeIcon.tsx";
import InfoTooltip from "../common/InfoTooltip.tsx";
import Tooltip from "../common/Tooltip.tsx";
import ConfigPill, {
  CONFIG_ONLY_DESTINATION,
  OVERRIDDEN_VALUE,
} from "./ConfigPill.tsx";
import LocationPicker, { type PickerFrame } from "./LocationPicker.tsx";
import SwitchSpinner from "./SwitchSpinner.tsx";

/** The destination Connect targets: flag, name, country, and the way to another one. */
export default function DestinationHero(props: {
  // Hands the parent a way to open the picker, for the keyboard shortcut.
  registerOpenPicker?: (open: () => void) => void;
  // The column the picker spans and where it must stop; measured when it opens.
  pickerFrame?: () => PickerFrame | null;
}) {
  const [appState, appActions] = useAppStore();

  const activeState = createMemo((): DestinationState | undefined => {
    const id = effectiveActive(appState.mode, Date.now());
    return id ? appState.destinations[id] : undefined;
  });
  const destination = () => activeState()?.destination;

  // How much color the flag has: grey while idle, filling in with the connect phases.
  const flagColor = (): number => {
    const status = appState.vpnStatus;
    if (status === "Connected") return 1;
    const inFlight = status === "Connecting" || status === "Reconnecting" ||
      isSwitchingDestination(status, appState.targetDestination);
    if (!inFlight) return 0;
    const phase = appState.reconnecting?.phase ?? appState.connecting?.phase;
    return connectProgress(phase) / 100;
  };

  const auto = () => appState.mode.mode.mode === "auto";
  const pending = () =>
    appState.mode.mode.mode === "auto" ? appState.mode.mode.pending : null;
  const candidateTitle = () => {
    const id = pending()?.candidateId;
    const candidate = id ? appState.destinations[id]?.destination : undefined;
    return candidate ? destinationTitle(candidate) : id ?? "";
  };

  // Where the Change location button sits: the picker hangs under it.
  const [anchor, setAnchor] = createSignal<DOMRect | null>(null);
  const [frame, setFrame] = createSignal<PickerFrame | null>(null);
  let changeButtonRef: HTMLButtonElement | undefined;

  const openList = () => {
    if (!changeButtonRef) return;
    setAnchor(changeButtonRef.getBoundingClientRect());
    setFrame(props.pickerFrame?.() ?? null);
    appActions.destinationListOpened();
  };
  props.registerOpenPicker?.(openList);
  const closeList = (picked: string | null) => {
    appActions.destinationListClosed(picked);
    changeButtonRef?.focus();
  };

  return (
    <div class="flex w-full flex-col items-center gap-2.5 text-center">
      <Show
        when={destination()}
        fallback={
          // Holds the hero's slot while the daemon reports no exit nodes.


            <div class="flex flex-col items-center gap-1 py-4">
              <span class="text-xl font-bold text-text-primary">
                No exit nodes available
              </span>
              <span class="text-xs text-text-secondary">
                Checking for new ones…
              </span>
            </div>

        }
      >
        {(dest) => (
          <>
            <Flag
              code={dest().geo?.country_code ?? ""}
              size="lg"
              color={flagColor()}
            />
            <div class="flex flex-col items-center">
              <Show when={auto()}>
                <span class="flex items-center gap-1.5 text-xs text-text-secondary">
                  Best location
                  <Show when={pending()?.countdownEndsAt} keyed>
                    {(endsAt) => (
                      <Tooltip content={`Switching to ${candidateTitle()}`}>
                        <span class="inline-block size-4">
                          <SwitchSpinner endsAt={endsAt} />
                        </span>
                      </Tooltip>
                    )}
                  </Show>
                </span>
              </Show>
              <h1 class="flex max-w-full items-center justify-center gap-1.5 text-xl font-bold leading-tight text-text-primary">
                {/* A pinned name only exists on a c+d entry, whose title is `id (name)`: the pill wraps the name alone. */}
                <Show
                  when={isConfigPinned(dest(), "name") &&
                    destinationName(dest())}
                  fallback={
                    <span class="truncate">{destinationTitle(dest())}</span>
                  }
                >
                  {(name) => (
                    <span class="truncate">
                      {dest().id} (<ConfigPill tooltip={OVERRIDDEN_VALUE}>
                        {name()}
                      </ConfigPill>)
                    </span>
                  )}
                </Show>
                <Show when={isConfigOnly(dest())}>
                  <ConfigPill
                    tooltip={CONFIG_ONLY_DESTINATION}
                    class="size-2.5"
                  />
                </Show>
                <Show when={destinationDescription(dest())}>
                  {(description) => (
                    <InfoTooltip
                      class="text-text-muted text-sm"
                      content={
                        <div class="space-y-1">
                          <p
                            classList={{
                              "rounded bg-vpn-orange px-1 text-slate-900":
                                isConfigPinned(dest(), "description"),
                            }}
                          >
                            {description()}
                          </p>
                          <Show when={isConfigPinned(dest(), "description")}>
                            <p class="text-text-muted">{OVERRIDDEN_VALUE}</p>
                          </Show>
                        </div>
                      }
                    />
                  )}
                </Show>
              </h1>
              <Show when={destinationCountry(dest())}>
                {(country) => (
                  <span class="text-xs text-text-secondary">{country()}</span>
                )}
              </Show>
            </div>
            <button
              ref={(el) => (changeButtonRef = el)}
              type="button"
              class="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-haspopup="dialog"
              aria-expanded={appState.mode.listOpen}
              onClick={openList}
            >
              <GlobeIcon class="size-3.5" />
              Change location
            </button>
          </>
        )}
      </Show>

      <Show when={appState.mode.listOpen && anchor()}>
        {(rect) => (
          <LocationPicker anchor={rect()} frame={frame()} onClose={closeList} />
        )}
      </Show>
    </div>
  );
}
