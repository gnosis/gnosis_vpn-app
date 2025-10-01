import parachute from "@assets/img/parachute.png";
import Button from "@src/components/common/Button";

export default function Airdrop({ setStep }: { setStep: (step: string) => void }) {
  const claim = () => {
    console.log("claim");
  };
  return (
    <div class="h-full w-full flex flex-col items-center p-6">
      <h1 class="text-2xl font-bold text-center my-6">Before we connect</h1>
      <div class="flex flex-col items-center gap-2 w-full flex-grow">
        <img src={parachute} alt="Parachute" class="w-1/3 mb-8" />
        <div class="w-full text-left">If you’re a tester, claim wxHOPR and xDAI</div>
        <label class="flex flex-col gap-1 w-full">
          <span class="text-sm font-bold">Secret code</span>
          <input type="text" class="rounded-xl border border-gray-700 p-2 w-full focus:outline-none" />
        </label>
        <Button size="lg" onClick={claim}>
          Claim
        </Button>
      </div>
      <Button size="lg" variant="outline" onClick={() => setStep("complete")}>
        Skip
      </Button>
    </div>
  );
}
