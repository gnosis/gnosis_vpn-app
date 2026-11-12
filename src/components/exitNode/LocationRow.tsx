import { type JSX, Show } from "solid-js";
import type { Destination } from "@src/services/vpnService.ts";
import {
  exitDisplayName,
  exitShortId,
  type RouteGrade,
  routeGradeLabel,
} from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import SignalBars from "./SignalBars.tsx";

const BUTTON_SHAPE = "h-8.5 shrink-0 rounded-lg px-3 text-[13px] font-bold";

export const ACTION_BUTTON =
  `${BUTTON_SHAPE} bg-control-bg hover:bg-control-bg-hover hover:cursor-pointer disabled:cursor-default disabled:opacity-50`;

/** Auto's "On" pill at its row's end. */
export const STATUS_PILL =
  "shrink-0 rounded-full bg-control-bg px-1.75 pt-[3px] pb-px text-[10px] leading-3 font-bold";

const ROW_BODY =
  "flex min-w-0 flex-1 items-center gap-3 self-stretch py-2.5 pr-3 pl-2.5 text-left";

/** A list row: its body selects when `onSelect` is given, beside the action button rather than around it. */
export function ListRow(props: {
  selectLabel: string;
  onSelect?: () => void;
  disabled?: boolean;
  // tinted at half the hover tone
  current?: boolean;
  action: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <div
      class={`flex min-h-14.5 items-center rounded-[10px] pr-2.5 hover:bg-row-hover ${
        props.current ? "bg-row-hover/50" : ""
      }`}
    >
      <Show
        when={props.onSelect}
        fallback={<div class={ROW_BODY}>{props.children}</div>}
      >
        {(onSelect) => (
          <button
            type="button"
            class={`${ROW_BODY} cursor-pointer rounded-[10px] disabled:cursor-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-control-tint`}
            aria-label={props.selectLabel}
            disabled={props.disabled}
            onClick={() => onSelect()()}
          >
            {props.children}
          </button>
        )}
      </Show>
      {props.action}
    </div>
  );
}

/** One exit in the list: flag, name with its short id, route grade, and the button that goes there. */
export default function LocationRow(props: {
  destination: Destination;
  grade: RouteGrade;
  actionLabel: "Connect" | "Switch";
  disabled: boolean;
  onAction: () => void;
  // the row's body picks the exit without connecting
  onSelect?: () => void;
  // the tunnel's own exit: there is nowhere to go, so the status takes the button's place
  status?: "Connected" | "Connecting";
}) {
  const destination = () => props.destination;
  const name = () => exitDisplayName(destination());
  const shortId = () => exitShortId(destination().address);
  const grade = () => props.grade;

  return (
    <ListRow
      selectLabel={[`Select ${name()} #${shortId()}`, routeGradeLabel(grade())]
        .filter(Boolean).join(", ")}
      onSelect={props.onSelect}
      disabled={props.disabled}
      current={props.status !== undefined}
      action={
        <Show
          when={props.status}
          fallback={
            <button
              type="button"
              class={ACTION_BUTTON}
              aria-label={`${props.actionLabel} to ${name()} #${shortId()}`}
              disabled={props.disabled}
              onClick={() => props.onAction()}
            >
              {props.actionLabel}
            </button>
          }
        >
          {(status) => (
            <span
              class={`${BUTTON_SHAPE} flex items-center`}
              classList={{
                "bg-btn-connect-bg text-btn-connect-text":
                  status() === "Connected",
                "bg-control-bg text-text-subtle": status() === "Connecting",
              }}
            >
              {status()}
            </span>
          )}
        </Show>
      }
    >
      <Flag
        code={destination().geo?.country ?? ""}
        sizeClass="w-7.5 h-5.25 rounded"
      />
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="truncate text-sm leading-[1.2] font-bold">
          {name()}
          <ShortId id={shortId()} />
        </span>
        <span class="flex items-center gap-1.5 text-xs text-text-subtle">
          <SignalBars grade={grade()} bare={props.onSelect !== undefined} />
          {routeGradeLabel(grade())}
        </span>
      </span>
    </ListRow>
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
