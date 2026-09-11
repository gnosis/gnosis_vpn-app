import { Show } from "solid-js";
import type { Destination } from "@src/services/vpnService.ts";
import {
  destinationLocation,
  destinationTitle,
  isConfigPinned,
} from "@src/utils/destinations.ts";
import ConfigPinMark from "./ConfigPinMark.tsx";

/** `title - location`, each value italic and marked `(c)` where configuration pinned it, as gvpn-ctl does. */
export default function DestinationLabel(props: {
  destination: Destination;
  class?: string;
  markClass?: string;
}) {
  const namePinned = () => isConfigPinned(props.destination, "name");
  const locationPinned = () => isConfigPinned(props.destination, "location");

  return (
    <span class={props.class}>
      <span classList={{ italic: namePinned() }}>
        {destinationTitle(props.destination)}
      </span>
      <Show when={namePinned()}>
        {" "}
        <ConfigPinMark class={props.markClass} />
      </Show>
      <Show when={destinationLocation(props.destination)}>
        {(location) => (
          <>
            {" - "}
            <span classList={{ italic: locationPinned() }}>{location()}</span>
            <Show when={locationPinned()}>
              {" "}
              <ConfigPinMark class={props.markClass} />
            </Show>
          </>
        )}
      </Show>
    </span>
  );
}
