import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

export interface SynchronizationProps {
  syncProgress: number;
  recoveryDeadline?: number | null;
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

export default function Synchronization(props: SynchronizationProps) {
  const [index, setIndex] = createSignal(0);
  const [isVisible, setIsVisible] = createSignal(true);
  const [now, setNow] = createSignal(Date.now());

  const progress = () => Math.min(100, Math.round(props.syncProgress));

  const secondsLeft = () => {
    const deadline = props.recoveryDeadline;
    if (deadline == null) return null;
    return Math.max(0, Math.ceil((deadline - now()) / 1000));
  };

  const CYCLE_DURATION = 7200;
  const FADE_DURATION = 500;

  onMount(() => {
    let fadeTimeout: ReturnType<typeof setTimeout> | undefined;
    const triviaTimer = setInterval(() => {
      setIsVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((prev) => (prev + 1) % trivia.length);
        setIsVisible(true);
        fadeTimeout = undefined;
      }, FADE_DURATION);
    }, CYCLE_DURATION);

    onCleanup(() => {
      clearInterval(triviaTimer);
      clearTimeout(fadeTimeout);
    });
  });

  createEffect(() => {
    if (props.recoveryDeadline == null || progress() < 100) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <div class="h-full w-full flex flex-col p-6 select-none bg-bg-primary text-text-primary">
      <h1 class="text-4xl font-bold">Syncing</h1>

      {/* Progress Section */}
      <div class="flex flex-col items-center gap-3 pt-12 w-full">
        <span class="text-xs font-bold uppercase tracking-widest text-text-secondary">
          Progress
        </span>
        <span class="text-3xl font-bold">{progress()}%</span>
        <div class="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            class="h-full rounded-full bg-accent relative overflow-hidden transition-[width] duration-100 ease-linear"
            style={{
              width: `${progress()}%`,
            }}
          >
            <div class="absolute inset-0 progress-shimmer" />
          </div>
        </div>
      </div>

      {/* Recovery warning when stuck at 100% waiting for peers/channels */}
      <Show when={secondsLeft() !== null && progress() >= 100}>
        <p class="text-center text-sm text-text-secondary mt-6 opacity-80">
          Oh snap, something seems wrong, waiting for recovery: {secondsLeft()}s
        </p>
      </Show>

      {/* Trivia Section */}
      <div class="grow flex flex-col items-center justify-center w-full max-w-lg self-center text-center px-4 pb-4">
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
    </div>
  );
}
