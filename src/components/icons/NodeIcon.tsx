/** The pixel-art node that stands in for an exit's flag; a 4:3 tile like the flags. */
export default function NodeIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 12 9"
      xmlns="http://www.w3.org/2000/svg"
      class={`shrink-0 ${props.class ?? ""}`}
      shape-rendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect width="12" height="9" fill-opacity="0.12" />
      {/* evenodd cuts the eyes out of the body */}
      <path
        fill-rule="evenodd"
        d="M2.5 3h7v4h-7zM4.5 4h1v1h-1zM6.5 4h1v1h-1zM3.5 7h1v1h-1zM7.5 7h1v1h-1z"
      />
      <rect x="5.5" y="6" width="1" height="1" fill="#d2d0e9" />
    </svg>
  );
}
