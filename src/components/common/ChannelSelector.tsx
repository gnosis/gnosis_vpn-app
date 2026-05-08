import SegmentedControl from "./SegmentedControl.tsx";
import { type UpdateChannel } from "@src/stores/settingsStore.ts";

const OPTIONS: { value: UpdateChannel; label: string }[] = [
  { value: "stable", label: "Stable" },
  { value: "snapshot", label: "Snapshot" },
];

interface ChannelSelectorProps {
  value: UpdateChannel;
  onChange: (channel: UpdateChannel) => void;
  disabled?: boolean;
}

export default function ChannelSelector(props: ChannelSelectorProps) {
  return (
    <div
      class={`flex items-center justify-between ${
        props.disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <span id="update-channel-selector-label" class="text-text-primary">
        Update channel
      </span>
      <SegmentedControl
        options={OPTIONS}
        value={props.value}
        onChange={props.onChange}
        ariaLabelledBy="update-channel-selector-label"
        disabled={props.disabled}
      />
    </div>
  );
}
