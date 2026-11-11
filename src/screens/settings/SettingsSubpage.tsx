import type { JSX } from "solid-js";
import PageHeader from "@src/components/common/PageHeader.tsx";
import PageLayer from "@src/components/common/PageLayer.tsx";

/** A page opened from a Settings row; it covers Settings until Back. */
export default function SettingsSubpage(
  props: { title: string; onBack: () => void; children: JSX.Element },
) {
  return (
    <PageLayer label={props.title}>
      <PageHeader title={props.title} onBack={props.onBack} />
      <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-1 pb-4.5">
        {props.children}
      </div>
    </PageLayer>
  );
}
