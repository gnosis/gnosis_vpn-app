import syncIcon from "@assets/icons/sync.svg";

export interface SynchronizationProps {
  vpnStatus: string; // Ideally, replace 'string' with your specific VpnStatus type
  warmupStatus: string; // If you have a specific type for this, use it instead of 'string'
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
"Strong privacy requires both encryption and metadata protection."
];

export default function Synchronization(props: SynchronizationProps) {
  return (
    <div class="h-full w-full flex flex-col items-center p-6 pb-0 select-none">
      <h1 class="w-full text-2xl font-bold text-center my-6">Syncing</h1>
      <img
        src={syncIcon}
        alt="Synchronization"
        class={`w-1/3 mb-8 dark:invert animate-spin-tick`}
      />
      <div class="text-sm text-text-secondary">
          {props.warmupStatus}
      </div>
      <div class="grow"></div>
    </div>
  );
}
