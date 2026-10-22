import { createMemo, Show } from "solid-js";
import Button, { type ButtonProps } from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { effectiveActive } from "../stores/destinationMode.ts";
import {
  isSelectable,
  isVpnActive,
  rankContext,
} from "../utils/destinations.ts";
import { logError } from "../utils/appLog.ts";
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

  const isActive = createMemo(() =>
    isVpnActive(appState.vpnStatus, appState.targetDestination)
  );
  const look = createMemo(() =>
    connectButtonLook(
      appState.vpnStatus,
      appState.targetDestination,
      appState.reconnecting !== null,
    )
  );

  const displayedId = createMemo(() =>
    effectiveActive(appState.mode, Date.now())
  );

  const targetDestinationState = createMemo(() => {
    const id = displayedId();
    return id ? appState.destinations[id] : undefined;
  });

  // Selectable, not ready: a weak route the user picked deliberately must still connect.
  const isTargetSelectable = createMemo(() =>
    isSelectable(targetDestinationState(), rankContext(appState))
  );

  const handleClick = async () => {
    try {
      if (isActive()) {
        await appActions.disconnect();
      } else {
        // Resolved fresh at click time: a memo recomputes on `mode`, not on the clock crossing settleAt.
        const id = effectiveActive(appState.mode, Date.now());
        if (id) await appActions.connect(id);
      }
    } catch (error) {
      // safety net — store actions handle their own errors
      const message = error instanceof Error ? error.message : String(error);
      logError(`Connect button action failed: ${message}`);
    }
  };

  const targetTitle = () => {
    const dest = targetDestinationState()?.destination;
    return dest ? destinationTitle(dest) : null;
  };

  return (
    <div class="relative z-20 w-full">
      <Button
        size="main"
        variant={variantOf[look().label]}
        onClick={() => void handleClick()}
        disabled={appState.isLoading || !(isActive() || isTargetSelectable())}
      >
        <Show
          when={look().label === "Connect" && targetTitle()}
          fallback={look().label}
        >
          {(title) => (
            <span class="inline-flex items-center gap-2">
              <OwlIcon class="size-[18px]" />
              <span class="truncate">Connect to {title()}</span>
            </span>
          )}
        </Show>
      </Button>
    </div>
  );
}
