import syncIcon from "@assets/icons/sync.svg";

export default function Synchronization() {
  return (
    <div class="h-full w-full flex flex-col items-center p-6">
      <h1 class="w-full text-2xl font-bold text-center my-6">
        Initial Synchronization
      </h1>
      <img
        src={syncIcon}
        alt="Synchronization"
        class="w-1/3 mb-8 animate-spin-tick"
      />
      <div>20%</div>
      <div class="text-sm text-gray-500">This can take up to 10 minutes</div>
    </div>
  );
}
