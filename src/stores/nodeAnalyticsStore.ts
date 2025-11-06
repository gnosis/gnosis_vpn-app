import { createStore, type Store } from "solid-js/store";
import { Store as TauriStore } from "@tauri-apps/plugin-store";

// Configuration constants for reliability scoring
const MAX_NODES_STORED = 100; // Prevent memory leak
const NODE_INACTIVITY_DAYS = 90; // Prune nodes not used in 90 days
const HISTORY_BONUS_DIVISOR = 10;
const HISTORY_BONUS_CAP = 10;
const RECENCY_WINDOW_MS = 86400000; // 24 hours
const RECENCY_BONUS = 5;

/**
 * Tracks performance metrics for decentralized VPN exit nodes
 * Helps users make informed decisions about which nodes to use
 */
export interface NodePerformanceMetrics {
  address: string;
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  totalUptime: number; // seconds connected
  lastConnected: string | null; // ISO timestamp
  averageSessionDuration: number; // seconds
  isFavorite: boolean;
  userNotes: string;
}

export interface ChannelActivity {
  timestamp: string; // ISO timestamp
  eventType: "channel_opened" | "channel_funded" | "channel_closed" | "ticket_redeemed";
  peerAddress: string;
  amount: string; // token amount
  channelBalance: string; // balance after event
}

export interface NetworkStats {
  totalNodesDiscovered: number;
  totalConnectionAttempts: number;
  totalSuccessfulConnections: number;
  totalBandwidthServed: number; // bytes served to network if running as node
  totalTokensSpent: string;
  totalTokensEarned: string;
}

export interface NodeAnalyticsState {
  nodeMetrics: Map<string, NodePerformanceMetrics>;
  channelActivity: ChannelActivity[];
  networkStats: NetworkStats;
  pathPreference: "shortest" | "balanced" | "most_private"; // routing preference
}

type NodeAnalyticsActions = {
  recordConnection: (address: string, success: boolean) => void;
  updateSessionDuration: (address: string, duration: number) => void;
  toggleFavorite: (address: string) => void;
  setNodeNotes: (address: string, notes: string) => void;
  recordChannelActivity: (activity: Omit<ChannelActivity, "timestamp">) => void;
  getNodeReliability: (address: string) => number; // 0-100 score
  getBestNodes: (count: number) => NodePerformanceMetrics[];
  pruneOldNodes: (metricsMap: Map<string, NodePerformanceMetrics>) => void;
  setPathPreference: (pref: "shortest" | "balanced" | "most_private") => Promise<void>;
  load: () => Promise<void>;
  save: () => Promise<void>;
  exportHistory: () => string; // JSON export for user backup
};

type NodeAnalyticsStoreTuple = readonly [
  Store<NodeAnalyticsState>,
  NodeAnalyticsActions,
];

let tauriStore: TauriStore | undefined;

async function getTauriStore(): Promise<TauriStore> {
  if (!tauriStore) {
    tauriStore = await TauriStore.load("node_analytics.json");
  }
  return tauriStore;
}

export function createNodeAnalyticsStore(): NodeAnalyticsStoreTuple {
  const [state, setState] = createStore<NodeAnalyticsState>({
    nodeMetrics: new Map(),
    channelActivity: [],
    networkStats: {
      totalNodesDiscovered: 0,
      totalConnectionAttempts: 0,
      totalSuccessfulConnections: 0,
      totalBandwidthServed: 0,
      totalTokensSpent: "0",
      totalTokensEarned: "0",
    },
    pathPreference: "balanced",
  });

  const actions: NodeAnalyticsActions = {
    recordConnection: (address: string, success: boolean) => {
      setState("networkStats", "totalConnectionAttempts", (c: number) => c + 1);
      if (success) {
        setState("networkStats", "totalSuccessfulConnections", (c: number) => c + 1);
      }

      // Track newly discovered nodes BEFORE adding to map
      const isNewNode = !state.nodeMetrics.has(address);
      if (isNewNode) {
        setState("networkStats", "totalNodesDiscovered", (c) => c + 1);
      }

      setState("nodeMetrics", (metrics: Map<string, NodePerformanceMetrics>) => {
        const existing = metrics.get(address);
        const updated: NodePerformanceMetrics = existing
          ? {
              ...existing,
              totalConnections: existing.totalConnections + 1,
              successfulConnections: success
                ? existing.successfulConnections + 1
                : existing.successfulConnections,
              failedConnections: success
                ? existing.failedConnections
                : existing.failedConnections + 1,
              lastConnected: success ? new Date().toISOString() : existing.lastConnected,
            }
          : {
              address,
              totalConnections: 1,
              successfulConnections: success ? 1 : 0,
              failedConnections: success ? 0 : 1,
              totalUptime: 0,
              lastConnected: success ? new Date().toISOString() : null,
              averageSessionDuration: 0,
              isFavorite: false,
              userNotes: "",
            };

        const newMap = new Map(metrics);
        newMap.set(address, updated);
        
        // Prune old nodes if we exceed MAX_NODES_STORED
        if (newMap.size > MAX_NODES_STORED) {
          actions.pruneOldNodes(newMap);
        }
        
        return newMap;
      });

      void actions.save();
    },

    updateSessionDuration: (address: string, duration: number) => {
      setState("nodeMetrics", (metrics: Map<string, NodePerformanceMetrics>) => {
        const existing = metrics.get(address);
        if (!existing) return metrics;

        const newTotalUptime = existing.totalUptime + duration;
        const avgDuration =
          existing.successfulConnections > 0
            ? newTotalUptime / existing.successfulConnections
            : 0;

        const updated: NodePerformanceMetrics = {
          ...existing,
          totalUptime: newTotalUptime,
          averageSessionDuration: avgDuration,
        };

        const newMap = new Map(metrics);
        newMap.set(address, updated);
        return newMap;
      });

      void actions.save();
    },

    toggleFavorite: (address: string) => {
      setState("nodeMetrics", (metrics: Map<string, NodePerformanceMetrics>) => {
        const existing = metrics.get(address);
        if (!existing) return metrics;

        const updated: NodePerformanceMetrics = {
          ...existing,
          isFavorite: !existing.isFavorite,
        };

        const newMap = new Map(metrics);
        newMap.set(address, updated);
        return newMap;
      });

      void actions.save();
    },

    setNodeNotes: (address: string, notes: string) => {
      setState("nodeMetrics", (metrics: Map<string, NodePerformanceMetrics>) => {
        const existing = metrics.get(address);
        if (!existing) return metrics;

        const updated: NodePerformanceMetrics = {
          ...existing,
          userNotes: notes,
        };

        const newMap = new Map(metrics);
        newMap.set(address, updated);
        return newMap;
      });

      void actions.save();
    },

    recordChannelActivity: (activity: Omit<ChannelActivity, "timestamp">) => {
      const fullActivity: ChannelActivity = {
        ...activity,
        timestamp: new Date().toISOString(),
      };

      setState("channelActivity", (activities: ChannelActivity[]) => [
        fullActivity,
        ...activities.slice(0, 99), // Keep last 100 activities
      ]);

      // Update network stats based on activity type
      if (activity.eventType === "ticket_redeemed") {
        setState("networkStats", "totalTokensEarned", (current: string) => {
          try {
            const currentBigInt = BigInt(current);
            const activityBigInt = BigInt(activity.amount);
            return (currentBigInt + activityBigInt).toString();
          } catch {
            return current;
          }
        });
      }

      void actions.save();
    },

    getNodeReliability: (address: string): number => {
      const metrics = state.nodeMetrics.get(address);
      if (!metrics || metrics.totalConnections === 0) return 0;

      const successRate =
        (metrics.successfulConnections / metrics.totalConnections) * 100;

      // Boost score for nodes with more history (more reliable data)
      const historyBonus = Math.min(metrics.totalConnections / HISTORY_BONUS_DIVISOR, 1) * HISTORY_BONUS_CAP;

      // Boost for recent usage
      const recencyBonus = metrics.lastConnected
        ? Date.now() - new Date(metrics.lastConnected).getTime() < RECENCY_WINDOW_MS
          ? RECENCY_BONUS
          : 0
        : 0;

      return Math.min(100, successRate + historyBonus + recencyBonus);
    },

    pruneOldNodes: (metricsMap: Map<string, NodePerformanceMetrics>) => {
      // Remove nodes that haven't been used in NODE_INACTIVITY_DAYS
      const cutoffTime = Date.now() - (NODE_INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
      const nodesToRemove: string[] = [];

      metricsMap.forEach((metrics, address) => {
        const lastUsed = metrics.lastConnected 
          ? new Date(metrics.lastConnected).getTime()
          : 0;
        
        // Don't remove favorites, but remove old inactive non-favorites
        if (!metrics.isFavorite && lastUsed < cutoffTime) {
          nodesToRemove.push(address);
        }
      });

      // Remove oldest nodes first until under limit
      if (metricsMap.size > MAX_NODES_STORED) {
        const sortedByAge = Array.from(metricsMap.values())
          .filter(m => !m.isFavorite) // Never remove favorites
          .sort((a, b) => {
            const aTime = a.lastConnected ? new Date(a.lastConnected).getTime() : 0;
            const bTime = b.lastConnected ? new Date(b.lastConnected).getTime() : 0;
            return aTime - bTime; // Oldest first
          });

        const excessCount = metricsMap.size - MAX_NODES_STORED;
        for (let i = 0; i < Math.min(excessCount, sortedByAge.length); i++) {
          nodesToRemove.push(sortedByAge[i].address);
        }
      }

      // Remove the nodes
      nodesToRemove.forEach(address => metricsMap.delete(address));
    },

    getBestNodes: (count: number): NodePerformanceMetrics[] => {
      const allNodes: NodePerformanceMetrics[] = Array.from(state.nodeMetrics.values());

      return allNodes
        .map((node) => ({
          node,
          score: actions.getNodeReliability(node.address),
        }))
        .sort((a, b) => {
          // Favorites first
          if (a.node.isFavorite && !b.node.isFavorite) return -1;
          if (!a.node.isFavorite && b.node.isFavorite) return 1;
          // Then by reliability score
          return b.score - a.score;
        })
        .slice(0, count)
        .map((item) => item.node);
    },

    setPathPreference: async (pref: "shortest" | "balanced" | "most_private") => {
      setState("pathPreference", pref);
      const store = await getTauriStore();
      await store.set("pathPreference", pref);
      await store.save();
    },

    load: async () => {
      const store = await getTauriStore();

      const [nodeMetricsArray, channelActivity, networkStats, pathPreference] =
        (await Promise.all([
          store.get("nodeMetrics"),
          store.get("channelActivity"),
          store.get("networkStats"),
          store.get("pathPreference"),
        ])) as [
          Array<[string, NodePerformanceMetrics]> | undefined,
          ChannelActivity[] | undefined,
          NetworkStats | undefined,
          ("shortest" | "balanced" | "most_private") | undefined,
        ];

      if (nodeMetricsArray) {
        setState("nodeMetrics", new Map(nodeMetricsArray));
      }
      if (channelActivity) {
        setState("channelActivity", channelActivity);
      }
      if (networkStats) {
        setState("networkStats", networkStats);
      }
      if (pathPreference) {
        setState("pathPreference", pathPreference);
      }
    },

    save: async () => {
      const store = await getTauriStore();
      const nodeMetricsArray = Array.from(state.nodeMetrics.entries());
      await store.set("nodeMetrics", nodeMetricsArray);
      await store.set("channelActivity", state.channelActivity);
      await store.set("networkStats", state.networkStats);
      await store.set("pathPreference", state.pathPreference);
      await store.save();
    },

    exportHistory: (): string => {
      const exportData = {
        nodeMetrics: Array.from(state.nodeMetrics.entries()),
        channelActivity: state.channelActivity,
        networkStats: state.networkStats,
        pathPreference: state.pathPreference,
        exportedAt: new Date().toISOString(),
      };
      return JSON.stringify(exportData, null, 2);
    },
  };

  return [state, actions] as const;
}

const nodeAnalyticsStore = createNodeAnalyticsStore();

export function useNodeAnalyticsStore(): NodeAnalyticsStoreTuple {
  return nodeAnalyticsStore;
}
