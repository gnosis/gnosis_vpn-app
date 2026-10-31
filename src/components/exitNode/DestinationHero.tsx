import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
} from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { effectiveActive } from "@src/stores/destinationMode.ts";
import {
  destinationCountry,
  destinationFlag,
  destinationTitle,
} from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import GlobeIcon from "../icons/GlobeIcon.tsx";
import Tooltip from "../common/Tooltip.tsx";
import LocationPicker, { type PickerFrame } from "./LocationPicker.tsx";
import SwitchSpinner from "./SwitchSpinner.tsx";

// Matches the name block's duration-150.
const SWAP_FADE_MS = 150;

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

  // Lags the active destination by one fade, so the old name fades out before the new one fades in.
  const [shownDestination, setShownDestination] = createSignal(destination());
  const [swapping, setSwapping] = createSignal(false);
  let swapTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    on(destination, (next) => {
      clearTimeout(swapTimer);
      const shown = shownDestination();
      const isSameLocation = next?.id === shown?.id;
      if (isSameLocation || !shown) {
        setShownDestination(next);
        setSwapping(false);
        return;
      }
      setSwapping(true);
      swapTimer = setTimeout(() => {
        setShownDestination(next);
        setSwapping(false);
      }, SWAP_FADE_MS);
    }),
  );
  onCleanup(() => clearTimeout(swapTimer));

  const auto = () => appState.mode.mode.mode === "auto";
  const pending = () =>
    appState.mode.mode.mode === "auto" ? appState.mode.mode.pending : null;
  // Kept after the switch settles so the spinner and its tooltip fade out intact.
  const [lastPending, setLastPending] = createSignal(pending());
  createEffect(() => {
    const current = pending();
    if (current) setLastPending(current);
  });
  const candidateTitle = () => {
    const id = lastPending()?.candidateId;
    const candidate = id ? appState.destinations[id]?.destination : undefined;
    return candidate ? destinationTitle(candidate) : id ?? "";
  };

  // Where the Change location button sits: the picker hangs under it.
  const [anchor, setAnchor] = createSignal<DOMRect | null>(null);
  const [frame, setFrame] = createSignal<PickerFrame | null>(null);
  let changeButtonRef: HTMLButtonElement | undefined;

  const openList = () => {
    // A page may have unmounted the hero while its registration lives on in MainScreen.
    if (!changeButtonRef?.isConnected) return;
    setAnchor(changeButtonRef.getBoundingClientRect());
    setFrame(props.pickerFrame?.() ?? null);
    appActions.destinationListOpened();
  };
  props.registerOpenPicker?.(openList);
  const closeList = (picked: string | null) => {
    appActions.destinationListClosed(picked);
    changeButtonRef?.focus();
  };
  const toggleList = () =>
    appState.mode.listOpen ? closeList(null) : openList();

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
            <Flag code={destinationFlag(dest())} size="lg" />
            <div class="flex flex-col items-center">
              {/* Always laid out, faded by opacity: mounting it would shift everything below. */}
              <span
                class={`relative text-xs text-text-secondary transition-opacity duration-300 ${
                  auto() ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                aria-hidden={!auto()}
              >
                Best location
                {/* Hangs off the label's right edge so its arrival never shifts the centred text. */}
                <span
                  class={`absolute left-full top-1/2 ml-1.5 -translate-y-1/2 transition-opacity duration-300 ${
                    pending() ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                >
                  <Show when={lastPending()?.countdownEndsAt} keyed>
                    {(endsAt) => (
                      <Tooltip content={`Switching to ${candidateTitle()}`}>
                        <span class="block size-4">
                          <SwitchSpinner endsAt={endsAt} />
                        </span>
                      </Tooltip>
                    )}
                  </Show>
                </span>
              </span>
              <div
                class={`flex max-w-full flex-col items-center transition-opacity duration-150 ${
                  swapping() ? "opacity-0" : "opacity-100"
                }`}
              >
                <h1 class="max-w-full truncate text-xl font-bold leading-tight text-text-primary">
                  {destinationTitle(shownDestination() ?? dest())}
                </h1>
                <Show when={destinationCountry(shownDestination() ?? dest())}>
                  {(country) => (
                    <span class="text-xs text-text-secondary">{country()}</span>
                  )}
                </Show>
              </div>
            </div>
            <button
              ref={(el) => (changeButtonRef = el)}
              type="button"
              class="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-haspopup="dialog"
              aria-expanded={appState.mode.listOpen}
              onClick={toggleList}
            >
              <GlobeIcon class="size-3.5" />
              Change location
            </button>
          </>
        )}
      </Show>

      <Show when={appState.mode.listOpen && anchor()}>
        {(rect) => (
          <LocationPicker
            anchor={rect()}
            frame={frame()}
            onClose={closeList}
            trigger={changeButtonRef}
          />
        )}
      </Show>
    </div>
  );
}
