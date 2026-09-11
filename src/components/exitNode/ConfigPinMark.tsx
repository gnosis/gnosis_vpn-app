import Tooltip from "../common/Tooltip.tsx";

/** gvpn-ctl's `(c)`: configuration set this value where the rest of the entry comes from discovery. */
export default function ConfigPinMark(props: { class?: string }) {
  return (
    <Tooltip content={<span>Set in your configuration</span>}>
      <span
        class={`cursor-help font-normal ${props.class ?? "text-text-muted"}`}
        onClick={(e) => e.stopPropagation()}
      >
        (c)
      </span>
    </Tooltip>
  );
}
