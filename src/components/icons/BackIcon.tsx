export default function BackIcon(props: { class?: string }) {
  return (
    <svg
      width="8"
      height="13"
      viewBox="0 0 8 13"
      class={`shrink-0 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <polyline
        points="7,1 1,6.5 7,12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  );
}
