import { createMemo, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  destinationCountry,
  destinationFlag,
  destinationTitle,
  getExitData,
  isSelectable,
  rankContext,
} from "@src/utils/destinations.ts";
import { pickerGrade, pickerVerdict } from "@src/utils/pickerVerdict.ts";
import Flag from "../Flag.tsx";
import CardTooltip from "./CardTooltip.tsx";
import RouteTooltip from "./RouteTooltip.tsx";
import SignalBars from "./SignalBars.tsx";

/** One line of the location picker: flag, name, country, and the route's bars in one column. */
export default function LocationRow(props: {
  destinationState: DestinationState;
  current: boolean;
  highlighted: boolean;
  // Live clock for "Checked"; the picker owns it so the rows share one.
  nowSec: number;
  // Shows the bars' tooltip without a pointer, e.g. for the keyboard-highlighted row.
  tooltipOpen?: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const [appState] = useAppStore();

  const destination = () => props.destinationState.destination;
  const exit = createMemo(() =>
    getExitData(props.destinationState, appState.probe)
  );
  const grade = createMemo(() =>
    pickerGrade(props.destinationState, exit(), rankContext(appState))
  );
  const routeHealth = () => props.destinationState.route_health ?? null;
  const verdict = () => pickerVerdict(grade(), routeHealth(), exit());
  const connected = () =>
    appState.connected?.destination_id === destination().id;
  const tunnelRtt = () =>
    connected() ? appState.connected?.tunnel_ping_rtt ?? null : null;
  // The live destination stays pickable: its tunnel exists and the slot it fills is ours.
  const pickable = () =>
    props.current ||
    isSelectable(props.destinationState, rankContext(appState));
  const accessibleName = () =>
    [
      destinationTitle(destination()),
      destinationCountry(destination()),
      verdict().headline,
    ]
      .filter(Boolean)
      .join(", ");

  return (
    <div
      role="option"
      aria-selected={props.highlighted}
      aria-disabled={!pickable()}
      aria-label={accessibleName()}
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
      <Flag code={destinationFlag(destination())} size="sm" />
      <span class="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span class="truncate font-semibold">
          {destinationTitle(destination())}
        </span>
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
      {/* One column: every row's bars sit at the same x, whatever their state. */}
      <span class="flex w-5 shrink-0 justify-end">
        <CardTooltip
          tooltip={
            <RouteTooltip
              verdict={verdict()}
              grade={grade()}
              routeHealth={routeHealth()}
              exit={exit()}
              tunnelRtt={tunnelRtt()}
              routing={destination().routing}
              connected={connected()}
              nowSec={props.nowSec}
            />
          }
          description={`${verdict().headline}. ${verdict().context}`}
          position="auto"
          align="end"
          open={props.tooltipOpen}
          bubbleClass="max-w-64"
        >
          <SignalBars grade={grade()} highlighted={props.highlighted} />
        </CardTooltip>
      </span>
    </div>
  );
}
