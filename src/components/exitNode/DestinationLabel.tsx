import { Show } from "solid-js";
import type { Destination } from "@src/services/vpnService.ts";
import {
  destinationLocation,
  destinationName,
  destinationTitle,
  isConfigPinned,
} from "@src/utils/destinations.ts";
import ConfigPill, { OVERRIDDEN_VALUE } from "./ConfigPill.tsx";

/** `title - location`, each value an orange pill where configuration overrode discovery. */
export default function DestinationLabel(props: {
  destination: Destination;
  class?: string;
}) {
  // A pinned name only exists on a c+d entry, whose title is `id (name)`: the pill wraps the name alone.
  const pinnedName = () =>
    isConfigPinned(props.destination, "name")
      ? destinationName(props.destination)
      : null;
  const locationPinned = () => isConfigPinned(props.destination, "location");

  return (
    <span class={props.class}>
      <Show
        when={pinnedName()}
        fallback={<span>{destinationTitle(props.destination)}</span>}
      >
        {(name) => (
          <>
            <span>{props.destination.id} (</span>
            <ConfigPill tooltip={OVERRIDDEN_VALUE}>{name()}</ConfigPill>
            <span>)</span>
          </>
        )}
      </Show>
      <Show when={destinationLocation(props.destination)}>
        {(location) => (
          <>
            {" - "}
            <Show when={locationPinned()} fallback={<span>{location()}</span>}>
              <ConfigPill tooltip={OVERRIDDEN_VALUE}>{location()}</ConfigPill>
            </Show>
          </>
        )}
      </Show>
    </span>
  );
}
