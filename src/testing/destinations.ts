import type { Destination } from "@src/services/vpnService.ts";

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
    routing: 1,
    gnosis_vpn_server: "172.30.0.1:8000",
    wireguard_server: "172.30.0.1:51820",
    source: "Configured",
    ...overrides,
    meta: {
      name: null,
      location: null,
      flag: undefined,
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
