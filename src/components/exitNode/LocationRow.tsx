import type { Destination } from "@src/services/vpnService.ts";
import {
  exitDisplayName,
  exitShortId,
  type RouteGrade,
  routeGradeLabel,
} from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import SignalBars from "./SignalBars.tsx";

export const ACTION_BUTTON =
  "h-8.5 shrink-0 rounded-lg bg-control-bg px-3 text-[13px] font-bold hover:bg-control-bg-hover hover:cursor-pointer disabled:cursor-default disabled:opacity-50";

/** One exit in the list: flag, name with its short id, route grade, and the button that goes there. */
export default function LocationRow(props: {
  destination: Destination;
  grade: RouteGrade;
  actionLabel: "Connect" | "Switch";
  disabled: boolean;
  onAction: () => void;
  // a click elsewhere on the row; the button stays the keyboard path
  onRowClick?: () => void;
}) {
  const destination = () => props.destination;
  const name = () => exitDisplayName(destination());
  const shortId = () => exitShortId(destination().address);
  const grade = () => props.grade;

  return (
    <div
      class="flex min-h-14.5 items-center gap-3 rounded-[10px] p-2.5 hover:bg-row-hover"
      onClick={(e) => {
        if (!props.onRowClick || props.disabled) return;
        // the button's own click already acted
        if ((e.target as Element).closest("button")) return;
        props.onRowClick();
      }}
    >
      <Flag
        code={destination().geo?.country ?? ""}
        sizeClass="w-7.5 h-5.25 rounded"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="truncate text-sm leading-[1.2] font-bold">
          {name()}
          <ShortId id={shortId()} />
        </span>
        <span class="flex items-center gap-1.5 text-xs text-text-subtle">
          <SignalBars grade={grade()} />
          {routeGradeLabel(grade())}
        </span>
      </div>
      <button
        type="button"
        class={ACTION_BUTTON}
        aria-label={`${props.actionLabel} to ${name()} #${shortId()}`}
        disabled={props.disabled}
        onClick={() => props.onAction()}
      >
        {props.actionLabel}
      </button>
    </div>
  );
}

/** The "#469Da" after an exit's name. */
export function ShortId(props: { id: string }) {
  return (
    <span
      class="ml-[0.35em] font-figures text-[11px] font-medium text-text-subtle"
      title="End of this exit's address"
    >
      #{props.id}
    </span>
  );
}
