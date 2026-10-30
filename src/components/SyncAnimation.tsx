import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import type { AnimationItem } from "lottie-web/build/player/lottie_light";
import lightAnimationUrl from "@assets/animations/gnosisvpn-sync-light.json?url";
import darkAnimationUrl from "@assets/animations/gnosisvpn-sync-dark.json?url";
import {
  syncAnimationSecondsAt,
  syncCaptionAt,
} from "@src/utils/syncScript.ts";
import {
  getRenderProfile,
  syncAnimationFps,
} from "@src/utils/renderProfile.ts";
import { logWarn } from "@src/utils/appLog.ts";

const FADE_DURATION = 500;
// Crops the 600×500 canvas's empty margins so the globe fills the width.
const ANIMATION_VIEW_BOX = "90 55 420 370";

/** Looping network-discovery animation with captions timed to its frames. */
export default function SyncAnimation() {
  let container!: HTMLDivElement;
  let animation: AnimationItem | undefined;

  const [renderProfile] = createResource(getRenderProfile);
  const [isDark, setIsDark] = createSignal(
    document.documentElement.classList.contains("dark"),
  );
  const [seconds, setSeconds] = createSignal(0);
  const caption = createMemo(() => syncCaptionAt(seconds()));
  const [shownCaption, setShownCaption] = createSignal(caption());
  const [isVisible, setIsVisible] = createSignal(true);

  const observer = new MutationObserver(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  createEffect(on(caption, (next) => {
    setIsVisible(false);
    const timer = setTimeout(() => {
      setShownCaption(next);
      setIsVisible(true);
    }, FADE_DURATION);
    onCleanup(() => clearTimeout(timer));
  }, { defer: true }));

  createEffect(() => {
    const url = isDark() ? darkAnimationUrl : lightAnimationUrl;
    let cancelled = false;
    // Lazy so the player stays out of the main bundle; only this screen needs it.
    Promise.all([
      import("lottie-web/build/player/lottie_light"),
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
    ])
      .then(([{ default: lottie }, animationData]) => {
        if (cancelled) return;
        animation?.destroy();
        animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          autoplay: false,
          animationData,
          rendererSettings: { viewBoxSize: ANIMATION_VIEW_BOX },
        });
      })
      .catch((e) => logWarn(`[sync] animation failed to load: ${e}`));
    onCleanup(() => {
      cancelled = true;
    });
  });

  // Timer-driven so wakeups match the capped rate; the shared clock also carries the loop across theme swaps.
  const startedAt = performance.now();
  let frameTimer = setTimeout(function tick() {
    frameTimer = setTimeout(tick, 1000 / syncAnimationFps(renderProfile()));
    if (!animation) return;
    const at = syncAnimationSecondsAt(
      (performance.now() - startedAt) / 1000,
      animation.totalFrames / animation.frameRate,
    );
    animation.goToAndStop(at * animation.frameRate, true);
    setSeconds(at);
  });

  onCleanup(() => {
    clearTimeout(frameTimer);
    observer.disconnect();
    animation?.destroy();
  });

  return (
    <div class="flex flex-col items-center gap-4 w-full">
      <div ref={container} class="w-full aspect-[420/370]" />
      <p
        class={`min-h-12 text-center text-text-secondary transition-opacity duration-500 ease-in-out ${
          isVisible() ? "opacity-100" : "opacity-0"
        }`}
      >
        {shownCaption()}
      </p>
    </div>
  );
}
