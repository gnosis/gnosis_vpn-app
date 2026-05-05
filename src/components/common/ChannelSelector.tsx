import SegmentedControl from "./SegmentedControl.tsx";
import { type UpdateChannel } from "@src/stores/settingsStore.ts";

const OPTIONS: { value: UpdateChannel; label: string }[] = [
  { value: "stable", label: "Stable" },
  { value: "snapshot", label: "Snapshot" },
];

interface ChannelSelectorProps {
  value: UpdateChannel;
  onChange: (channel: UpdateChannel) => void;
}

export default function ChannelSelector(props: ChannelSelectorProps) {
  return (
    <div class="flex items-center justify-between">
      <span class="text-text-primary">Update channel</span>
      <SegmentedControl
        options={OPTIONS}
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  );
}
