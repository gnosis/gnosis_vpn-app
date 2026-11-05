export default function ChevronIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 18 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class={`shrink-0 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <path
        d="M17 1L8.46667 9L1 1"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
