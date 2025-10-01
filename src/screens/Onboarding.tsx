import { createSignal } from 'solid-js';
import Start from '../components/onboarding/Start';
import Airdrop from '../components/onboarding/Airdrop';
import { Dynamic } from 'solid-js/web';
import Complete from '../components/onboarding/Complete';

const steps = {
  start: Start,
  airdrop: Airdrop,
  complete: Complete,
};

export default function Onboarding() {
  const [step, setStep] = createSignal<'start' | 'airdrop'>('start');

  return (
    <div class="h-screen bg-gray-100 dark:bg-gray-900">
      <Dynamic component={steps[step()]} setStep={setStep} />
    </div>
  );
}
