import { createMemo, For, Show } from "solid-js";
import { useAppStore } from "@src/stores/appStore";
import { shortAddress } from "@src/utils/shortAddress";

/**
 * Visualizes the multi-hop decentralized routing path
 * Shows how packets travel through the HOPR network for privacy
 */
export function PathVisualization() {
  const [appState] = useAppStore();

  const currentDestination = createMemo(() => {
    if (!appState.runMode || typeof appState.runMode !== "object") return null;
    if (!("Running" in appState.runMode)) return null;

    const connection = appState.runMode.Running.connection;
    if (typeof connection !== "object" || !connection) return null;

    if ("Connected" in connection) return connection.Connected;
    if ("Connecting" in connection) return connection.Connecting;
    return null;
  });

  const pathInfo = createMemo(() => {
    const dest = currentDestination();
    if (!dest) return null;

    const path = dest.path;
    if ("Hops" in path) {
      return {
        type: "hops" as const,
        count: path.Hops,
        nodes: [] as string[],
      };
    } else if ("IntermediatePath" in path) {
      return {
        type: "intermediate" as const,
        count: path.IntermediatePath.length + 1,
        nodes: path.IntermediatePath,
      };
    }
    return null;
  });

  const privacyLevel = createMemo(() => {
    const path = pathInfo();
    if (!path) return { level: "none", color: "gray" };

    const hops = path.count;
    if (hops >= 3)
      return { level: "High Privacy", color: "green", description: "3+ hops" };
    if (hops === 2)
      return {
        level: "Medium Privacy",
        color: "yellow",
        description: "2 hops",
      };
    return {
      level: "Basic Privacy",
      color: "orange",
      description: "1 hop (direct)",
    };
  });

  return (
    <Show when={currentDestination()}>
      <div class="w-full bg-white rounded-2xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">
            Routing Path
          </span>
          <span
            class={`text-xs font-semibold px-2 py-1 rounded-full ${
              privacyLevel().color === "green"
                ? "bg-green-100 text-green-800"
                : privacyLevel().color === "yellow"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-orange-100 text-orange-800"
            }`}
          >
            {privacyLevel().level}
          </span>
        </div>

        <div class="flex items-center gap-2">
          {/* Your Node */}
          <div class="flex flex-col items-center flex-1">
            <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
              You
            </div>
            <span class="text-xs text-gray-500 mt-1">Source</span>
          </div>

          {/* Path arrows and relay nodes */}
          <Show when={pathInfo()}>
            {(path) => (
              <>
                <Show
                  when={path().type === "intermediate" && path().nodes.length > 0}
                  fallback={
                    <>
                      {/* Show hop count for anonymous routing */}
                      <For each={Array(Math.min(path().count - 1, 3)).fill(0)}>
                        {(_, i) => (
                          <>
                            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                            </svg>
                            <div class="flex flex-col items-center">
                              <div class="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-mono">
                                ?
                              </div>
                              <span class="text-xs text-gray-400 mt-1">
                                Relay {i() + 1}
                              </span>
                            </div>
                          </>
                        )}
                      </For>
                    </>
                  }
                >
                  {/* Show actual intermediate nodes if known */}
                  <For each={path().nodes}>
                    {(node, i) => (
                      <>
                        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                        <div class="flex flex-col items-center">
                          <div class="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-mono">
                            {i() + 1}
                          </div>
                          <span class="text-xs text-gray-500 mt-1 font-mono">
                            {shortAddress(node)}
                          </span>
                        </div>
                      </>
                    )}
                  </For>
                </Show>

                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </Show>

          {/* Exit Node */}
          <div class="flex flex-col items-center flex-1">
            <div class="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-xs">
              Exit
            </div>
            <span class="text-xs text-gray-500 mt-1">
              {currentDestination() ? shortAddress(currentDestination()!.address) : ""}
            </span>
          </div>
        </div>

        <div class="pt-2 border-t border-gray-100">
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-500">
              Total hops: {pathInfo()?.count ?? 0}
            </span>
            <span class="text-gray-500">
              {privacyLevel().description}
            </span>
          </div>
        </div>

        <div class="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
          <svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
          Each relay node only knows the previous and next hop, protecting your identity
        </div>
      </div>
    </Show>
  );
}
