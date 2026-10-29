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
import { syncCaptionAt } from "@src/utils/syncScript.ts";
import {
  getRenderProfile,
  syncAnimationFps,
} from "@src/utils/renderProfile.ts";
import { logWarn } from "@src/utils/appLog.ts";

const FADE_DURATION = 500;
// Crops the 600×500 canvas's empty margins so the globe fills the width.
const ANIMATION_VIEW_BOX = "90 55 420 370";
// Keeps display-refresh jitter from turning every other 30 fps frame into a skipped one.
const FRAME_SLACK_MS = 2;

/** Looping network-discovery animation with captions timed to its frames. */
export default function SyncAnimation() {
  let container!: HTMLDivElement;
  let animation: AnimationItem | undefined;
  let lastDrawAt = -Infinity;

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
        lastDrawAt = -Infinity;
      })
      .catch((e) => logWarn(`[sync] animation failed to load: ${e}`));
    onCleanup(() => {
      cancelled = true;
    });
  });

  // Driven by hand to cap the frame rate; the shared clock also carries the loop across theme swaps.
  const startedAt = performance.now();
  let frameRequest = requestAnimationFrame(function tick(now) {
    frameRequest = requestAnimationFrame(tick);
    const minFrameMs = 1000 / syncAnimationFps(renderProfile());
    if (!animation || now - lastDrawAt < minFrameMs - FRAME_SLACK_MS) return;
    lastDrawAt = now;
    const loopSeconds = animation.totalFrames / animation.frameRate;
    const at = ((now - startedAt) / 1000) % loopSeconds;
    animation.goToAndStop(at * animation.frameRate, true);
    setSeconds(at);
  });

  onCleanup(() => {
    cancelAnimationFrame(frameRequest);
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
