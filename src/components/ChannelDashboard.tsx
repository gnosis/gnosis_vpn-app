import { createSignal, onMount, Show } from "solid-js";
import { VPNService, type BalanceResponse, type FundingIssue } from "@src/services/vpnService";

// Issue message mapping for cleaner rendering
const ISSUE_MESSAGES: Record<FundingIssue, string> = {
  Unfunded: "Initial funding needed to start",
  ChannelsOutOfFunds: "Channels need refilling for traffic",
  SafeOutOfFunds: "Safe needs tokens to fund channels",
  SafeLowOnFunds: "Safe balance running low",
  NodeUnderfunded: "Node balance insufficient",
  NodeLowOnFunds: "Node balance running low",
};

// Color configuration for status indicators
type StatusColor = "green" | "yellow" | "orange" | "red";
const STATUS_COLORS: Record<StatusColor, { bg: string; dot: string; text: string }> = {
  green: { bg: "bg-green-50", dot: "bg-green-500", text: "text-green-800" },
  yellow: { bg: "bg-yellow-50", dot: "bg-yellow-500", text: "text-yellow-800" },
  orange: { bg: "bg-orange-50", dot: "bg-orange-500", text: "text-orange-800" },
  red: { bg: "bg-red-50", dot: "bg-red-500", text: "text-red-800" },
};

/**
 * Displays payment channel status, token balances, and funding issues
 * Critical for users to understand decentralized payment flows
 */
export function ChannelDashboard() {
  const [balance, setBalance] = createSignal<BalanceResponse | null>(null);

  onMount(() => {
    void loadBalance();
  });

  const loadBalance = async () => {
    try {
      const result = await VPNService.balance();
      setBalance(result);
    } catch (error) {
      console.error("Failed to load balance:", error);
    }
  };

  const formatBalance = (value: string | undefined) => {
    if (!value) return "0.00";
    try {
      const num = parseFloat(value);
      if (num === 0) return "0.00";
      if (num < 0.01) return "< 0.01";
      return num.toFixed(4);
    } catch {
      return "0.00";
    }
  };

  const getStatusColor = (issues: FundingIssue[]): StatusColor => {
    if (issues.length === 0) return "green";
    if (
      issues.includes("Unfunded") ||
      issues.includes("ChannelsOutOfFunds")
    ) {
      return "red";
    }
    if (
      issues.includes("NodeUnderfunded") ||
      issues.includes("SafeOutOfFunds")
    ) {
      return "orange";
    }
    return "yellow";
  };

  const getStatusMessage = (issues: FundingIssue[]) => {
    if (issues.length === 0) return "Well Funded";
    if (issues.includes("Unfunded")) return "Needs Initial Funding";
    if (issues.includes("ChannelsOutOfFunds")) return "Channels Out of Funds";
    if (issues.includes("SafeOutOfFunds")) return "Safe Needs Refill";
    if (issues.includes("NodeUnderfunded")) return "Node Running Low";
    if (issues.includes("SafeLowOnFunds") || issues.includes("NodeLowOnFunds"))
      return "Low Balance Warning";
    return "Check Balances";
  };

  const refreshBalance = async () => {
    try {
      await VPNService.refreshNode();
      // Poll for updated balance with exponential backoff
      const pollForUpdate = async (attempts = 0, maxAttempts = 5) => {
        if (attempts >= maxAttempts) return;
        
        await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempts)));
        await loadBalance();
        
        // Could add logic here to check if balance actually changed
        // and continue polling if needed
      };
      
      await pollForUpdate();
    } catch (error) {
      console.error("Failed to refresh:", error);
    }
  };

  return (
    <div class="w-full bg-white rounded-2xl p-4 space-y-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700">
          Payment Channels
        </span>
        <button
          onClick={() => void refreshBalance()}
          class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <Show when={balance()}>
        {(bal) => {
          const statusColor = getStatusColor(bal().issues);
          const colorClasses = STATUS_COLORS[statusColor];

          return (
          <>
            {/* Status Indicator */}
            <div class={`flex items-center gap-2 p-3 rounded-lg ${colorClasses.bg}`}>
              <div class={`w-3 h-3 rounded-full ${colorClasses.dot}`} />
              <span class={`text-sm font-medium ${colorClasses.text}`}>
                {getStatusMessage(bal().issues)}
              </span>
            </div>

            {/* Balance Details */}
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-gray-50 rounded-lg p-3">
                <div class="text-xs text-gray-500 mb-1">Node Balance</div>
                <div class="text-lg font-bold text-gray-900">
                  {formatBalance(bal().node)}
                </div>
                <div class="text-xs text-gray-500">wxHOPR</div>
              </div>

              <div class="bg-gray-50 rounded-lg p-3">
                <div class="text-xs text-gray-500 mb-1">Safe Balance</div>
                <div class="text-lg font-bold text-gray-900">
                  {formatBalance(bal().safe)}
                </div>
                <div class="text-xs text-gray-500">wxHOPR</div>
              </div>

              <div class="bg-gray-50 rounded-lg p-3 col-span-2">
                <div class="text-xs text-gray-500 mb-1">
                  Channels Outbound
                </div>
                <div class="text-lg font-bold text-gray-900">
                  {formatBalance(bal().channels_out)}
                </div>
                <div class="text-xs text-gray-500">
                  Used for relay payments
                </div>
              </div>
            </div>

            {/* Addresses */}
            <div class="pt-2 border-t border-gray-100 space-y-2">
              <div>
                <div class="text-xs text-gray-500">Node Address</div>
                <div class="text-xs font-mono text-gray-700 truncate">
                  {bal().addresses.node}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500">Safe Address</div>
                <div class="text-xs font-mono text-gray-700 truncate">
                  {bal().addresses.safe}
                </div>
              </div>
            </div>

            {/* Funding Issues */}
            <Show when={bal().issues.length > 0}>
              <div class="pt-2 border-t border-gray-100">
                <div class="text-xs font-medium text-gray-700 mb-2">
                  Action Required:
                </div>
                <ul class="text-xs text-gray-600 space-y-1 list-disc list-inside">
                  {bal().issues.map((issue) => (
                    <li>{ISSUE_MESSAGES[issue]}</li>
                  ))}
                </ul>
              </div>
            </Show>
          </>
          );
        }}
      </Show>

      <div class="text-xs text-gray-500 bg-blue-50 rounded-lg p-2 flex items-start gap-2">
        <svg class="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
        </svg>
        <span class="text-blue-800">
          Payments flow through HOPR channels. Relay nodes earn tokens by forwarding your traffic.
        </span>
      </div>
    </div>
  );
}
