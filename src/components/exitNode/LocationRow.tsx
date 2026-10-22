import { createMemo, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  destinationCountry,
  destinationTitle,
  getExitData,
  isConfigOnly,
  isSelectable,
  rankContext,
} from "@src/utils/destinations.ts";
import {
  formatExitHealthStatus,
  formatRouting,
  getHopCount,
  getRouteVerdict,
} from "@src/utils/exitHealth.ts";
import Flag from "../Flag.tsx";
import Tag from "../common/Tag.tsx";
import ConfigPill, { CONFIG_ONLY_DESTINATION } from "./ConfigPill.tsx";
import HopsIcon from "./HopsIcon.tsx";
import WeakRouteTag from "./WeakRouteTag.tsx";

/** One line of the location picker: flag, name, country, and the tags that qualify it. */
export default function LocationRow(props: {
  destinationState: DestinationState;
  current: boolean;
  highlighted: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const [appState] = useAppStore();

  const destination = () => props.destinationState.destination;
  const exit = createMemo(() =>
    getExitData(props.destinationState, appState.probe)
  );
  const verdict = () => {
    const rh = props.destinationState.route_health;
    return rh ? getRouteVerdict(rh, exit()) : null;
  };
  // The live destination stays pickable: its tunnel exists and the slot it fills is ours.
  const pickable = () =>
    props.current ||
    isSelectable(props.destinationState, rankContext(appState));
  const hopCount = () => getHopCount(destination().routing);
  // A pickable row explains a weak route with its tag; an unpickable one states the verdict.
  const verdictTag = () => {
    const rh = props.destinationState.route_health;
    if (pickable() || !rh) return null;
    return formatExitHealthStatus(rh, exit());
  };

  return (
    <div
      role="option"
      aria-selected={props.highlighted}
      aria-disabled={!pickable()}
      data-pickable={pickable()}
      class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs"
      classList={{
        "bg-accent text-accent-text": props.highlighted,
        "text-text-primary": !props.highlighted,
        "opacity-50": !pickable(),
      }}
      onMouseEnter={props.onHover}
      onClick={() => pickable() && props.onPick()}
    >
      <Flag code={destination().geo?.country_code ?? ""} size="sm" />
      <span class="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span class="truncate font-semibold">
          {destinationTitle(destination())}
        </span>
        <Show when={isConfigOnly(destination())}>
          <ConfigPill
            tooltip={CONFIG_ONLY_DESTINATION}
            class="size-2.5 self-center"
          />
        </Show>
        <Show when={destinationCountry(destination())}>
          {(country) => (
            <span
              class="truncate text-[11px]"
              classList={{
                "text-accent-text/80": props.highlighted,
                "text-text-secondary": !props.highlighted,
              }}
            >
              {country()}
            </span>
          )}
        </Show>
      </span>
      <span class="flex shrink-0 items-center gap-1">
        <Show when={verdict() === "weak" && pickable()}>
          <WeakRouteTag />
        </Show>
        <Show when={verdictTag()}>
          {(text) => (
            // The name keeps its room; a long verdict is what gets cut.
            <Tag class="max-w-[120px] bg-bg-primary text-text-secondary">
              <span class="truncate">{text()}</span>
            </Tag>
          )}
        </Show>
        <Show when={hopCount() !== 1}>
          <Tag>
            <HopsIcon count={hopCount()} hideCount />
            <span class="ml-1 whitespace-nowrap">
              {formatRouting(destination().routing)}
            </span>
          </Tag>
        </Show>
        <Show when={props.current}>
          <svg
            viewBox="0 0 16 16"
            class="size-3.5"
            classList={{
              "text-accent-text": props.highlighted,
              "text-text-green": !props.highlighted,
            }}
            aria-label="Current location"
            role="img"
          >
            <path
              d="M3 8.5l3.2 3.2L13 5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </Show>
      </span>
    </div>
  );
}
