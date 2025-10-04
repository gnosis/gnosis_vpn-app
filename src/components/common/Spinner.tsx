export default function Spinner() {
  return (
    <div class="w-5 h-5 mr-4">
      <div
        class={`border-2 rounded-full animate-spin w-full h-full`}
        style="border-color: currentColor; border-top-color: transparent;"
      >
      </div>
    </div>
  );
}
