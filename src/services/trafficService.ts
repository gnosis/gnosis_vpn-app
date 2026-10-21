import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// ==========================================
// Zod Schemas & Inferred Types
// ==========================================

export const TrafficClassSchema = z.enum(["hopr_associated", "other"]);
export type TrafficClass = z.infer<typeof TrafficClassSchema>;

export const TrafficInterfaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Local addresses; the daemon needs them to infer direction. Never rendered.
  addresses: z.array(z.string()),
  is_default: z.boolean(),
});
export type TrafficInterface = z.infer<typeof TrafficInterfaceSchema>;

export const TrafficCellSchema = z.object({
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  band: z.number().int().min(1).max(6),
  class: TrafficClassSchema,
});
export type TrafficCell = z.infer<typeof TrafficCellSchema>;

export const TrafficFrameSchema = z.object({
  timeframe_seconds: z.number().int().positive(),
  current_second: z.number().int().nonnegative(),
  total_rows: z.number().int().nonnegative(),
  first_row: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  cells: z.array(TrafficCellSchema),
  dropped_targets: z.number().int().nonnegative(),
  dropped_batches: z.number().int().nonnegative(),
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
// Constants
// ==========================================

export const DEFAULT_TIMEFRAME_SECONDS = 20;
export const MIN_TIMEFRAME_SECONDS = 1;
export const MAX_TIMEFRAME_SECONDS = 300;
export const TIMEFRAME_PRESETS = [5, 10, 20, 30, 60] as const;
/** Vertical extent of one row in CSS pixels. */
export const TRAFFIC_ROW_HEIGHT = 6;

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

export async function fetchTrafficFrame(
  timeframeSeconds: number,
  firstRow: number,
  rowCount: number,
): Promise<TrafficFrameResponse> {
  const rawRes = await invoke("traffic_frame", {
    timeframeSeconds,
    firstRow,
    rowCount,
  });
  return TrafficFrameResponseSchema.parse(rawRes);
}

export async function stopTrafficCapture(): Promise<void> {
  await invoke("traffic_stop");
}

/**
 * Clamps a requested window length to the range the daemon accepts.
 * Returns `null` for values that are not whole seconds in range.
 */
export function parseTimeframe(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value < MIN_TIMEFRAME_SECONDS || value > MAX_TIMEFRAME_SECONDS) {
    return null;
  }
  return value;
}
