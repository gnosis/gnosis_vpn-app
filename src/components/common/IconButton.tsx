export default function IconButton(props: { icon: string; alt: string; onClick: () => void }) {
  return (
    <button
      class="p-2 rounded-2xl bg-black hover:cursor-pointer w-10 h-10 flex items-center justify-center"
      onClick={props.onClick}
    >
      <img src={props.icon} alt={props.alt} class="w-5 h-5" />
    </button>
  );
}
