import { createEffect, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import Button from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";

let runDir: string | null = null;
function getRunDir(): string {
  if (!runDir) runDir = `/tmp/runtime${Date.now()}`;
  return runDir;
}

// appState.balance holds wei amounts as BigInt, which JSON.stringify rejects outright.
function stringifyState(appState: unknown): string {
  return JSON.stringify(
    appState,
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
    2,
  );
}

async function persistSnapshot(fileName: string, content: string) {
  try {
    await invoke("write_debug_snapshot", {
      path: `${getRunDir()}/${fileName}`,
      content,
    });
  } catch (error) {
    console.error("Failed to write debug snapshot:", error);
  }
}

let snapshotCounter = -1;
let autoCounter = -1;

export default function DebugSnapshotButton() {
  const [appState] = useAppStore();

  // Records every appState change once this component is mounted (main screen).
  createEffect(on(
    () => stringifyState(appState),
    (content) => {
      autoCounter += 1;
      void persistSnapshot(
        `autotrans-${String(autoCounter).padStart(4, "0")}.json`,
        content,
      );
    },
    { defer: true },
  ));

  const handleClick = () => {
    snapshotCounter += 1;
    const content = stringifyState(appState);
    void persistSnapshot(
      `state-${String(snapshotCounter).padStart(3, "0")}.json`,
      content,
    );
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleClick}>
      Snapshot
    </Button>
  );
}
