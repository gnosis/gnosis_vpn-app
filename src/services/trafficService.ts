import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { StatusResponseSchema } from "@src/services/vpnService.ts";
import { destinationFlag, destinationTitle } from "@src/utils/destinations.ts";

// ==========================================
// Zod Schemas & Inferred Types
// ==========================================

export const TrafficInterfaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Local addresses; the daemon needs them to infer direction. Never rendered.
  addresses: z.array(z.string()),
  is_default: z.boolean(),
});
export type TrafficInterface = z.infer<typeof TrafficInterfaceSchema>;

// Strict: an endpoint is an opaque id plus byte totals, never an address.
export const TrafficEndpointSchema = z.strictObject({
  id: z.string(),
  sent: z.number().int().nonnegative(),
  received: z.number().int().nonnegative(),
  // The address is one a HOPR node announced; says nothing about the traffic.
  hopr_peer: z.boolean(),
  // A destination seen inside the VPN tunnel rather than a next hop on the wire.
  tunnel: z.boolean(),
});
export type TrafficEndpoint = z.infer<typeof TrafficEndpointSchema>;

export const TrafficFrameSchema = z.object({
  window_seconds: z.number().int().positive(),
  current_second: z.number().int().nonnegative(),
  observed_seconds: z.number().int().nonnegative(),
  endpoints: z.array(TrafficEndpointSchema),
  omitted_endpoints: z.number().int().nonnegative(),
});
export type TrafficFrame = z.infer<typeof TrafficFrameSchema>;

export const CaptureStatusSchema = z.object({
  active: z.boolean(),
  interface: z.string().nullable(),
  error: z.string().nullable(),
  ended: z.string().nullable(),
});
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;

export const TrafficFrameResponseSchema = z.object({
  frame: TrafficFrameSchema,
  capture: CaptureStatusSchema,
  gap: z.boolean(),
});
export type TrafficFrameResponse = z.infer<typeof TrafficFrameResponseSchema>;

// ==========================================
// Derived Values
// ==========================================

/** Bytes per second, wire only: tunnel destinations carry the same bytes and would count the VPN twice. */
export function averageRates(
  frame: TrafficFrame,
): { sent: number; received: number } {
  if (frame.observed_seconds === 0) return { sent: 0, received: 0 };
  let sent = 0;
  let received = 0;
  for (const endpoint of frame.endpoints) {
    if (endpoint.tunnel) continue;
    sent += endpoint.sent;
    received += endpoint.received;
  }
  return {
    sent: sent / frame.observed_seconds,
    received: received / frame.observed_seconds,
  };
}

export interface ConnectedExit {
  title: string;
  flag: string;
}

/** Reads the exit from a `status` event payload; anything but a parsable Connected answer means no exit. */
export function connectedExit(payload: unknown): ConnectedExit | null {
  const answer = z.object({ Ok: z.unknown() }).safeParse(payload);
  if (!answer.success) return null;
  const status = StatusResponseSchema.safeParse(answer.data.Ok);
  if (!status.success || !status.data.connected) return null;
  const exitId = status.data.connected.destination_id;
  const exit = status.data.destinations.find((entry) =>
    entry.destination.id === exitId
  );
  if (!exit) return null;
  return {
    title: destinationTitle(exit.destination),
    flag: destinationFlag(exit.destination),
  };
}

// ==========================================
// API Client
// ==========================================

export async function listTrafficInterfaces(): Promise<TrafficInterface[]> {
  const rawRes = await invoke("traffic_interfaces");
  return z.array(TrafficInterfaceSchema).parse(rawRes);
}

export async function startTrafficCapture(
  interfaceId: string,
): Promise<CaptureStatus> {
  const rawRes = await invoke("traffic_start", { interfaceId });
  return CaptureStatusSchema.parse(rawRes);
}

export async function fetchTrafficFrame(): Promise<TrafficFrameResponse> {
  const rawRes = await invoke("traffic_frame");
  return TrafficFrameResponseSchema.parse(rawRes);
}

export async function stopTrafficCapture(): Promise<void> {
  await invoke("traffic_stop");
}

export async function fetchConnectedExit(): Promise<ConnectedExit | null> {
  const cached = await invoke<{ status: unknown }>("get_cached_state");
  return connectedExit(cached.status);
}
