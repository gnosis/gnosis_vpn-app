import { Show } from "solid-js";
import type { Destination } from "@src/services/vpnService.ts";
import {
  destinationLocation,
  destinationTitle,
  isConfigPinned,
} from "@src/utils/destinations.ts";
import ConfigPill, { OVERRIDDEN_VALUE } from "./ConfigPill.tsx";

/** `title - location`, each value an orange pill where configuration overrode discovery. */
export default function DestinationLabel(props: {
  destination: Destination;
  class?: string;
}) {
  const namePinned = () => isConfigPinned(props.destination, "name");
  const locationPinned = () => isConfigPinned(props.destination, "location");

  return (
    <span class={props.class}>
      <Show
        when={namePinned()}
        fallback={<span>{destinationTitle(props.destination)}</span>}
      >
        <ConfigPill tooltip={OVERRIDDEN_VALUE}>
          {destinationTitle(props.destination)}
        </ConfigPill>
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
