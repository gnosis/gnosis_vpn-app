import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import type { JSX } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import { UpPhaseSchema } from "../../services/vpnService.ts";

type Mode = "idle" | "connecting" | "connected" | "sleeping";
type Eye = "left" | "right";

const BLINK_MS = 260;

// Owl paths lifted from public/gnosis.svg (75x75); pupils are separate so they can blink.
function OwlSvg(props: { blink?: Eye | null; class?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 75 75"
      class={`h-24 w-24 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <path
        class="owl-pupil"
        classList={{ "owl-blink": props.blink === "left" }}
        d="M12.32 33.08C12.2859 30.9109 12.9912 28.7948 14.32 27.08L27.96 40.72C26.2408 42.0404 24.1277 42.7447 21.96 42.72C19.4066 42.7095 16.9608 41.6905 15.1552 39.8849C13.3496 38.0793 12.3306 35.6335 12.32 33.08Z"
        fill="currentColor"
      />
      <path
        class="owl-pupil"
        classList={{ "owl-blink": props.blink === "right" }}
        d="M52.9 42.71C54.1771 42.7153 55.4426 42.4678 56.6237 41.9818C57.8047 41.4958 58.8778 40.781 59.7813 39.8784C60.6848 38.9758 61.4008 37.9034 61.888 36.7229C62.3752 35.5423 62.624 34.2771 62.62 33C62.6439 30.8325 61.9396 28.7197 60.62 27L46.94 40.68C48.6405 42.0102 50.7411 42.7257 52.9 42.71Z"
        fill="currentColor"
      />
      <path
        d="M63.4499 24.23C65.5528 26.6994 66.7084 29.8366 66.7099 33.08C66.7073 36.7277 65.2564 40.225 62.6762 42.8034C60.096 45.3817 56.5976 46.83 52.9499 46.83C49.7234 46.8337 46.5994 45.6967 44.1299 43.62L37.5099 50.24L30.8899 43.62C28.4187 45.7004 25.2902 46.8377 22.0599 46.83C20.2496 46.8366 18.4557 46.4859 16.7812 45.798C15.1066 45.11 13.5843 44.0984 12.3014 42.8211C11.0185 41.5437 10.0002 40.0258 9.30496 38.3543C8.60975 36.6827 8.25121 34.8904 8.24991 33.08C8.25249 29.8515 9.38859 26.7265 11.4599 24.25L8.3699 21.16L5.41995 18.16C1.86631 24.0027 -0.00901661 30.7115 -9.03528e-05 37.55C-0.00140495 42.4653 0.96596 47.3327 2.84665 51.8739C4.72734 56.4152 7.48451 60.5413 10.9606 64.0164C14.4367 67.4916 18.5636 70.2477 23.1053 72.1272C27.6471 74.0066 32.5146 74.9727 37.4299 74.97C47.3492 74.9674 56.8621 71.0285 63.8799 64.0183C70.8977 57.008 74.8467 47.4993 74.86 37.58C74.9217 30.7426 73.0646 24.025 69.4999 18.19L63.4499 24.23Z"
        fill="currentColor"
      />
      <path
        d="M64.54 11.74C61.0496 8.07017 56.8486 5.14916 52.1931 3.1549C47.5375 1.16065 42.5247 0.134865 37.46 0.140034C32.3942 0.137583 27.3808 1.16455 22.724 3.1586C18.0672 5.15266 13.8641 8.07221 10.37 11.74C9.46 12.74 8.57005 13.74 7.74005 14.81L37.43 44.49L67.12 14.78C66.3361 13.7045 65.4738 12.6884 64.54 11.74ZM37.46 37.56L14.46 14.56C17.4671 11.5209 21.0501 9.11181 24.9993 7.47375C28.9485 5.8357 33.1846 5.00153 37.46 5.02004C41.7362 4.99649 45.9738 5.82835 49.9237 7.46669C53.8736 9.10504 57.456 11.5168 60.46 14.56L37.46 37.56Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StatusHero() {
  const [appState] = useAppStore();

  const mode = createMemo<Mode>(() => {
    const status = appState.vpnStatus;
    if (!appState.runMode) return "sleeping";
    if (status === "Connected") return "connected";
    if (status === "Connecting" || status === "Reconnecting") {
      return "connecting";
    }
    if (status === "Disconnected" || status === "Disconnecting") return "idle";
    // ServiceUnavailable, WorkerRestarting, warmup states: service isn't ready
    return "sleeping";
  });

  // Fill level from the 12 ordered UpPhases; 8% floor keeps a sliver visible right away.
  const fillPct = () => {
    // Connected clears the phase info; hold 100% so the morphing owl stays green
    if (appState.vpnStatus === "Connected") return 100;
    const phase = appState.reconnecting?.phase ?? appState.connecting?.phase;
    if (!phase) return 8;
    const phases = UpPhaseSchema.options;
    const idx = phases.indexOf(phase);
    return Math.max(8, ((idx + 1) / phases.length) * 100);
  };

  // Idle blink loop: every 3-5s a random eye blinks briefly.
  const [blink, setBlink] = createSignal<Eye | null>(null);
  createEffect(() => {
    if (mode() !== "idle") {
      setBlink(null);
      return;
    }
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleBlink = () => {
      openTimer = setTimeout(() => {
        setBlink(Math.random() < 0.5 ? "left" : "right");
        closeTimer = setTimeout(() => {
          setBlink(null);
          scheduleBlink();
        }, BLINK_MS);
      }, 3000 + Math.random() * 2000);
    };
    scheduleBlink();
    onCleanup(() => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    });
  });

  // Morph only on connecting -> connected; a memo flips with mode in the same render pass (an effect would let <Show> unmount/remount mid-transition)
  const modePair = createMemo<[Mode, Mode | undefined]>(
    (prev) => [mode(), prev?.[0]],
  );
  const morphStarted = () => {
    const [current, previous] = modePair();
    return current === "connected" && previous === "connecting";
  };

  // check-pop is the last morph animation to finish: 750ms delay + 400ms run
  const MORPH_TOTAL_MS = 1150;
  // Bounds the morph — modePair never recomputes while connected, so the faded-out owl would otherwise stay mounted forever
  const [morphEnded, setMorphEnded] = createSignal(false);
  const morphing = () => morphStarted() && !morphEnded();
  createEffect(() => {
    if (!morphStarted()) {
      setMorphEnded(false);
      return;
    }
    const timer = setTimeout(() => setMorphEnded(true), MORPH_TOTAL_MS);
    onCleanup(() => clearTimeout(timer));
  });

  // While morphing, the owl stays mounted at animated opacity 0 until mode changes
  const showOwl = () => mode() !== "connected" || morphing();
  const showFill = () => mode() === "connecting" || morphing();

  const ariaLabel = () => {
    const labels: Record<Mode, string> = {
      idle: "Disconnected",
      connecting: "Connecting",
      connected: "Connected",
      sleeping: "Service unavailable",
    };
    return labels[mode()];
  };

  return (
    <div class="w-full h-1/3 flex flex-col items-center justify-center gap-3 shrink-0">
      <div
        class="relative h-24 w-full flex items-center justify-center"
        role="img"
        aria-label={ariaLabel()}
      >
        <Show when={showOwl()}>
          <div
            class="relative text-text-primary"
            classList={{
              "opacity-40": mode() === "sleeping",
              "owl-morph-out": morphing(),
            }}
          >
            <OwlSvg
              blink={blink()}
              class={mode() === "sleeping" ? "owl-asleep" : ""}
            />
            <Show when={showFill()}>
              <div
                class="owl-fill-layer"
                style={{
                  "--owl-inset": `${100 - fillPct()}%`,
                }}
              >
                <OwlSvg />
              </div>
            </Show>
          </div>
        </Show>
        <Show when={mode() === "connected"}>
          <svg
            viewBox="0 0 137 96"
            class="h-24 absolute"
            classList={{ "check-pop-entry": morphing() }}
            aria-hidden="true"
          >
            <path
              d="M6 55.4L37.4286 87L130.5 6"
              pathLength="100"
              classList={{ "check-draw": morphing() }}
              stroke="var(--color-vpn-light-green)"
              stroke-width="12"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </Show>
      </div>
    </div>
  );
}

export default StatusHero;
