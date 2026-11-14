export default function ArrowRightIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class={`shrink-0 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <path
        d="M2.5 8H12.5M8.5 4L12.5 8L8.5 12"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
