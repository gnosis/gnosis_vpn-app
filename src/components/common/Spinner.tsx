interface SpinnerProps {
  class?: string;
}

export default function Spinner(props: SpinnerProps) {
  return (
    <div
      class={`border-2 rounded-full animate-spin ${props.class || "w-5 h-5"}`}
      style="border-color: currentColor; border-top-color: transparent;"
    >
    </div>
  );
}
