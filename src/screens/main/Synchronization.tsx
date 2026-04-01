import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import {
  isDeployingSafeRunMode,
  isRunningRunMode,
  isWarmupRunMode,
  type RunMode,
} from "@src/services/vpnService.ts";

export interface SynchronizationProps {
  warmupStatus: string;
  runMode: RunMode | null;
}

const trivia = [
  "Gnosis VPN routes your traffic through the HOPR mixnet.",
  "HOPR is a privacy network built as an incentivized mixnet.",
  "A mixnet hides metadata by relaying packets through multiple independent nodes.",
  "Each HOPR packet is wrapped in layered encryption, similar to onion routing.",
  "HOPR nodes only know the previous and next hop, never the full route.",
  "Cover traffic in HOPR helps make real user traffic harder to analyze.",
  "HOPR uses probabilistic micropayments to incentivize node operators.",
  "Payments in HOPR are settled on the Gnosis Chain.",
  "Anyone can run a HOPR node and earn rewards for relaying traffic.",
  "HOPR separates network transport from application logic.",
  "Metadata, not content, is often the biggest privacy risk online.",
  "HOPR packets are fixed-size to reduce traffic fingerprinting.",
  "The HOPR protocol is open source and permissionless.",
  "Incentives align node operators to provide reliable service.",
  "HOPR is designed to resist traffic correlation attacks.",
  "Mixnets prioritize privacy over raw latency.",
  "Decentralized exit nodes reduce reliance on central providers.",
  "HOPR uses cryptographic tickets to reward honest relaying.",
  "Privacy improves when more independent nodes participate.",
  "Strong privacy requires both encryption and metadata protection.",
];

const STEP_CONFIG = [
  { step: 1, startPct: 0, endPct: 30, durationMs: 30_000 },
  { step: 2, startPct: 30, endPct: 40, durationMs: 10_000 },
  { step: 3, startPct: 40, endPct: 100, durationMs: 60_000 },
] as const;

function getCurrentStep(runMode: RunMode | null): 1 | 2 | 3 | null {
  if (!runMode) return null;
  if (isDeployingSafeRunMode(runMode)) return 1;
  if (isWarmupRunMode(runMode)) return 2;
  if (isRunningRunMode(runMode)) return 3;
  return null;
}

export default function Synchronization(props: SynchronizationProps) {
  const [index, setIndex] = createSignal(0);
  const [isVisible, setIsVisible] = createSignal(true);
  const [displayedProgress, setDisplayedProgress] = createSignal(0);
  const [lastKnownStep, setLastKnownStep] = createSignal<1 | 2 | 3 | null>(
    null,
  );
  let stepEnteredAt = Date.now();
  let prevEffectiveStep: 1 | 2 | 3 | null = null;

  const resolvedStep = createMemo(() => getCurrentStep(props.runMode));
  createEffect(() => {
    const s = resolvedStep();
    if (s !== null) setLastKnownStep(s);
  });
  const effectiveStep = createMemo(() =>
    resolvedStep() ?? lastKnownStep() ?? 1
  );

  createEffect(() => {
    const step = effectiveStep();
    if (step === prevEffectiveStep) return;
    prevEffectiveStep = step;
    const cfg = STEP_CONFIG[step - 1];
    stepEnteredAt = Date.now();
    setDisplayedProgress((prev) => Math.max(prev, cfg.startPct));
  });

  const CYCLE_DURATION = 6600;
  const FADE_DURATION = 500;

  onMount(() => {
    let fadeTimeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setIsVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((prev) => (prev + 1) % trivia.length);
        setIsVisible(true);
        fadeTimeout = undefined;
      }, FADE_DURATION);
    }, CYCLE_DURATION);

    const progressTick = setInterval(() => {
      const step = effectiveStep();
      const cfg = STEP_CONFIG[step - 1];
      const elapsed = Date.now() - stepEnteredAt;
      const raw = cfg.startPct +
        (elapsed / cfg.durationMs) * (cfg.endPct - cfg.startPct);
      const clamped = Math.min(Math.max(raw, cfg.startPct), cfg.endPct);
      setDisplayedProgress((prev) => Math.max(prev, clamped));
    }, 50);

    onCleanup(() => {
      clearInterval(timer);
      clearInterval(progressTick);
      clearTimeout(fadeTimeout);
    });
  });

  return (
    <div class="h-full w-full flex flex-col items-center justify-between p-6 select-none bg-bg-primary text-text-primary">
      <h1 class="text-2xl font-bold text-text-primary self-start ml-4">
        Syncing
      </h1>

      {/* Progress Bar Section */}
      <div class="w-full flex flex-col items-center justify-center px-6 gap-4 pt-20">
        <div class="flex flex-col items-center justify-center gap-1">
          <span class="text-xs uppercase tracking-widest text-text-secondary opacity-70">
            Progress
          </span>
          <span class="text-sm font-semibold text-text-primary">
            {Math.round(displayedProgress())}%
          </span>
        </div>

        <div
          class="w-3/4 h-3 rounded-full overflow-hidden"
          style={{ "background-color": "var(--color-progress-track)" }}
        >
          <div
            class="h-full transition-none"
            style={{
              width: `${displayedProgress()}%`,
              background: "var(--color-progress-fill)",
              "border-radius": "5px",
            }}
          />
        </div>
      </div>

      {/* Trivia Section */}
      <div class="flex flex-col w-full max-w-lg text-center px-4 h-80 mt-20">
        <h3 class="text-xs uppercase tracking-widest text-text-secondary mb-4 opacity-70">
          Did you know?
        </h3>
        <p
          class={`text-xl md:text-2xl font-medium leading-relaxed transition-opacity duration-500 ease-in-out ${
            isVisible() ? "opacity-100" : "opacity-0"
          }`}
        >
          {trivia[index()]}
        </p>
      </div>

      {/* Status Section */}
      <div class="w-full flex justify-center pb-2">
        <span class="text-xs font-mono text-text-secondary opacity-30 truncate max-w-[80%] text-center">
          {props.warmupStatus}
        </span>
      </div>
    </div>
  );
}
