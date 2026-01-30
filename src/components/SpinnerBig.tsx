import type { JSX } from "solid-js";

type Props = {
  size?: number;
  color?: string;
  speed?: number;
  class?: string;
};

export default function SpinnerBig(props: Props): JSX.Element {
  const size = props.size ?? 112;
  const color = props.color ?? "currentColor";
  const speed = props.speed ?? 1.7;

  const bars = Array.from({ length: 12 });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      class={`text-text-primary ${props.class ?? ""}`}
      role="img"
      aria-label="Loading"
    >
      {bars.map((_, i) => {
        const rot = i * 30;
        const begin = -(speed * (11 - i)) / 12;
        return (
          <g transform={`rotate(${rot} 50 50)`}>
            <rect
              x="44"
              y="0"
              rx="6"
              ry="6"
              width="8"
              height="30"
              fill={color}
              opacity="0"
            >
              <animate
                attributeName="opacity"
                values="0;1;0"
                dur={`${speed}s`}
                begin={`${begin}s`}
                repeatCount="indefinite"
              />
            </rect>
          </g>
        );
      })}
    </svg>
  );
}
