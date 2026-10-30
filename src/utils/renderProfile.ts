import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { logWarn } from "@src/utils/appLog.ts";

const RenderProfileSchema = z.object({
  softwareRendering: z.boolean(),
  cpuCores: z.number().int().positive(),
});
export type RenderProfile = z.infer<typeof RenderProfileSchema>;

/** What the backend's GPU probe found the webview can afford; `undefined` when unknown. */
export async function getRenderProfile(): Promise<RenderProfile | undefined> {
  try {
    return RenderProfileSchema.parse(
      await invoke<unknown>("get_render_profile"),
    );
  } catch (e) {
    logWarn(`get_render_profile failed: ${e}`);
    return undefined;
  }
}

const FULL_FPS = 30;
const LEAN_FPS = 15;

/** Full rate needs a verified GPU and spare cores; anything unknown runs lean. */
export function syncAnimationFps(profile: RenderProfile | undefined): number {
  return profile && !profile.softwareRendering && profile.cpuCores > 2
    ? FULL_FPS
    : LEAN_FPS;
}
