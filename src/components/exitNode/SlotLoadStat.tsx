import { createMemo } from "solid-js";
import type { RouteHealthView } from "@src/services/vpnService.ts";
import { getSlotLoad, getSlotLoadLevel } from "@src/utils/exitHealth.ts";
import { levelValueClass } from "./levelColor.ts";
import Stat from "./Stat.tsx";

/** Slot-usage stat, colored by the share of connection slots in use. */
export default function SlotLoadStat(
  props: { routeHealth: RouteHealthView | null },
) {
  const load = createMemo(() => {
    const rh = props.routeHealth;
    return rh ? getSlotLoad(rh) : null;
  });
  const value = () => {
    const l = load();
    return l ? `${l.percent}%` : null;
  };
  const valueClass = () =>
    levelValueClass(getSlotLoadLevel(load()?.percent ?? 0));
  const slotsInUse = () => {
    const l = load();
    return l ? ` (${l.used} of ${l.total})` : "";
  };

  return (
    <Stat
      label="Load"
      value={value()}
      valueClass={valueClass()}
      tooltip={
        <span>Connection slots in use{slotsInUse()}. Lower is better.</span>
      }
    />
  );
}
