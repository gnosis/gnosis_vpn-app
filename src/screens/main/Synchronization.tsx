import { createSignal, onCleanup, onMount } from "solid-js";
import syncIcon from "@assets/icons/sync.svg";

export interface SynchronizationProps {
  warmupStatus: string;
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

  const CYCLE_DURATION = 5000;
  const FADE_DURATION = 500;

  onMount(() => {
    const timer = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % trivia.length);
        setIsVisible(true);
      }, FADE_DURATION);
    }, CYCLE_DURATION);

    onCleanup(() => clearInterval(timer));
  });

  return (
    <div class="h-full w-full flex flex-col items-center p-6 select-none bg-bg-primary text-text-primary">
      {/* Trivia Section */}
      <div class="grow flex flex-col items-center justify-center w-full max-w-lg text-center px-4">
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

      {/* Spinner Section */}
      <div class="flex flex-col items-center justify-center py-8">
        <img
          src={syncIcon}
          alt="Synchronization Spinner"
          class="w-16 h-16 dark:invert animate-spin-smooth opacity-80"
        />
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
