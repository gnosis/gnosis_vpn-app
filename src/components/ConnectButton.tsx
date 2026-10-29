import { createMemo, Show } from "solid-js";
import Button, { type ButtonProps } from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { effectiveActive } from "../stores/destinationMode.ts";
import {
  primaryActionEnabled,
  runPrimaryAction,
} from "../utils/primaryAction.ts";
import { type ConnectButtonLook, connectButtonLook } from "../utils/status.ts";
import { destinationTitle } from "../utils/destinations.ts";
import OwlIcon from "./icons/OwlIcon.tsx";

// The look's own variant is for the old full-size button; here Cancel is quiet grey, not red.
const variantOf: Record<ConnectButtonLook["label"], ButtonProps["variant"]> = {
  Connect: "primary",
  Cancel: "neutral",
  Disconnect: "stop",
};

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();

  const look = createMemo(() =>
    connectButtonLook(
      appState.vpnStatus,
      appState.targetDestination,
      appState.reconnecting !== null,
    )
  );

  const targetDestinationState = createMemo(() => {
    const id = effectiveActive(appState.mode, Date.now());
    return id ? appState.destinations[id] : undefined;
  });

  const targetTitle = () => {
    const dest = targetDestinationState()?.destination;
    return dest ? destinationTitle(dest) : null;
  };

  return (
    <div class="relative z-20 w-full">
      <Button
        size="main"
        variant={variantOf[look().label]}
        onClick={() => void runPrimaryAction(appState, appActions)}
        disabled={!primaryActionEnabled(appState)}
      >
        <Show
          when={look().label === "Connect" && targetTitle()}
          fallback={look().label}
        >
          {(title) => (
            // The trailing spacer mirrors the owl so the label sits on the button's true centre.
            <span class="flex min-w-0 items-center gap-2">
              <OwlIcon class="size-[18px] shrink-0" />
              <span class="truncate">Connect to {title()}</span>
              <span class="size-[18px] shrink-0" aria-hidden="true" />
            </span>
          )}
        </Show>
      </Button>
    </div>
  );
}
