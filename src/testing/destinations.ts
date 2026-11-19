import type {
  Destination,
  ProbeView,
  QuickProbeCheck,
  QuickProbeState,
  RouteHealthView,
  Slots,
} from "@src/services/vpnService.ts";

type DestinationOverrides =
  & Partial<Omit<Destination, "meta" | "overrides" | "names">>
  & {
    meta?: Partial<Destination["meta"]>;
    overrides?: Partial<Destination["overrides"]>;
    names?: Partial<Destination["names"]>;
  };

/** A configured, 1-hop destination with sensible defaults; override only what a test is about. Names are what the backend would send, never derived here. */
export function makeDestination(
  overrides: DestinationOverrides = {},
): Destination {
  const id = overrides.id ?? "dest-1";
  return {
    id,
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
    names: {
      display_name: id,
      title: id,
      short_id: "xexit",
      country: null,
      description: null,
      ...overrides.names,
    },
  };
}

/** Routable and graded by the daemon; the top exit always reads 100. */
export function gradedRouteHealth(percentOfBest = 100): RouteHealthView {
  return {
    state: { type: "routable" },
    last_error: null,
    walked_at: 0,
    percent_of_best: percentOfBest,
    quick_probe: null,
  };
}

/** Routable, and the best exit right now. */
export function eligibleRouteHealth(): RouteHealthView {
  return gradedRouteHealth();
}

/** The walk found nothing plannable. */
export function noPathRouteHealth(): RouteHealthView {
  return {
    state: { type: "not_routable" },
    last_error: null,
    walked_at: 0,
    percent_of_best: null,
    quick_probe: null,
  };
}

export function unrecoverableRouteHealth(): RouteHealthView {
  return {
    state: { type: "unrecoverable", reason: { type: "not_allowed" } },
    last_error: null,
    walked_at: null,
    percent_of_best: null,
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
