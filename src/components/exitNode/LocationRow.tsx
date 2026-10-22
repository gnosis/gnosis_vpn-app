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
import SignalBars from "./SignalBars.tsx";

/** One line of the location picker: flag, name, country, and the route's bars in one column. */
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
  const grade = createMemo(() =>
    pickerGrade(props.destinationState, exit(), rankContext(appState))
  );
  const verdict = () =>
    pickerVerdict(grade(), props.destinationState.route_health ?? null, exit());
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
        <SignalBars grade={grade()} highlighted={props.highlighted} />
      </span>
    </div>
  );
}
