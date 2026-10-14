export default function ListIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 19 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class={`shrink-0 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <path
        d="M1 1H2M1 6H2M1 11H2M6 1H17M6 6H17M6 11H17"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
