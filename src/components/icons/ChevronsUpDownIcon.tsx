export default function ChevronsUpDownIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 16 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class={`shrink-0 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <path
        d="M3 6L8 1L13 6M3 12L8 17L13 12"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
