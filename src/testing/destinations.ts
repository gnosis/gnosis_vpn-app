import type {
  Destination,
  ProbeView,
  QuickProbeCheck,
  QuickProbeState,
  RouteHealthView,
  Slots,
} from "@src/services/vpnService.ts";

type DestinationOverrides = Partial<Omit<Destination, "meta" | "overrides">> & {
  meta?: Partial<Destination["meta"]>;
  overrides?: Partial<Destination["overrides"]>;
};

/** A configured, 1-hop destination with sensible defaults; override only what a test is about. */
export function makeDestination(
  overrides: DestinationOverrides = {},
): Destination {
  return {
    id: "dest-1",
    address: "0xexit",
    hops: 1,
    gnosis_vpn_server: "172.30.0.1:8000",
    wireguard_server: "172.30.0.1:51820",
    source: "configured",
    geo: null,
    ...overrides,
    meta: {
      name: null,
      description: null,
      other: {},
      ...overrides.meta,
    },
    overrides: {
      configured_meta: {},
      configured_gnosis_vpn_server: null,
      configured_wireguard_server: null,
      ...overrides.overrides,
    },
  };
}

/** Routable with a path within the band: eligible. More distinct relays ranks higher. */
export function eligibleRouteHealth(
  relays = 2,
  count = relays,
): RouteHealthView {
  return {
    state: { type: "routable" },
    last_error: null,
    walk: {
      type: "paths",
      walked_at: 0,
      count,
      distinct_first_relays: relays,
      best_relays: Array.from({ length: relays }, (_, i) => `0xrelay${i}`),
      best_value: 1,
    },
    quick_probe: null,
  };
}

/** Routable, but the best path is degraded: offered grayed out, never a candidate. */
export function weakRouteHealth(bestValue = 0.5): RouteHealthView {
  return {
    ...eligibleRouteHealth(1),
    walk: {
      type: "paths",
      walked_at: 0,
      count: 1,
      distinct_first_relays: 1,
      best_relays: ["0xrelay0"],
      best_value: bestValue,
    },
  };
}

/** The walk found nothing plannable. */
export function noPathRouteHealth(): RouteHealthView {
  return {
    state: { type: "not_routable" },
    last_error: null,
    walk: { type: "no_path", walked_at: 0 },
    quick_probe: null,
  };
}

export function unrecoverableRouteHealth(): RouteHealthView {
  return {
    state: { type: "unrecoverable", reason: { type: "not_allowed" } },
    last_error: null,
    walk: null,
    quick_probe: null,
  };
}

/** What one quick probe measured: slots plus a round trip in ms. */
export function quickProbeCheck(
  slots: Slots,
  rtt = 100,
  checkedAt = 0,
): QuickProbeCheck {
  return {
    checked_at: checkedAt,
    versions: { api: ["v1"], server: null },
    api_version: "v1",
    load: { slots, load_avg: { one: 0.5, five: 0.5, fifteen: 0.5, nproc: 4 } },
    status_rtt: rtt,
  };
}

/** A quick probe that measured the exit: slots plus a round trip in ms. */
export function checkedQuickProbe(
  slots: Slots,
  rtt = 100,
  checkedAt = 0,
): QuickProbeState {
  return { type: "checked", ...quickProbeCheck(slots, rtt, checkedAt) };
}

/** A quick probe in flight, carrying whatever the previous one measured. */
export function checkingQuickProbe(
  last: QuickProbeCheck | null = null,
  since = 0,
): QuickProbeState {
  return { type: "checking", since, last };
}

/** The daemon's probe session on `id`, already reporting slots and a round trip. */
export function probeViewFor(
  id: string,
  slots: Slots,
  rtt = 100,
  checkedAt = 0,
): ProbeView {
  return {
    destination: id,
    state: "ready",
    session_since: 0,
    versions: { api: ["v1"], server: null },
    api_version: "v1",
    ping_rtt: rtt,
    load: { slots, load_avg: { one: 0.5, five: 0.5, fifteen: 0.5, nproc: 4 } },
    checked_at: checkedAt,
    consecutive_failures: 0,
    last_error: null,
  };
}
