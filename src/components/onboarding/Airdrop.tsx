import parachute from "../../assets/img/parachute.png";
import Button from "../common/Button";

export default function Airdrop({ setStep }: { setStep: (step: string) => void }) {
  return (
    <div class="h-full w-full flex flex-col items-center p-6">
      <h1 class="text-2xl font-bold text-center">Before we connect</h1>
      <img src={parachute} alt="Parachute" class="w-1/3" />
      <div class="flex flex-col gap-2 w-full">
      <div>
        If you’re a tester, claim wxHOPR and xDAI
      </div>
      <label class="flex flex-col gap-1 w-full">
        <span class="text-sm font-bold">
          Secret code
        </span>
        <input type="text" class="rounded-xl border border-gray-700 p-2 w-full focus:outline-none" />
      </label>
      <div>
        <Button size="lg" onClick={() => setStep("start")}>Claim</Button>
      </div>
      </div>
      <Button size="lg" variant="outline" onClick={() => setStep("start")}>Skip</Button>
    </div>
  )
}