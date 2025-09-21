import { createSignal } from 'solid-js';
import { SecondaryScreen } from '../components/common/SecondaryScreen';
import { VPNService, type BalanceResponse } from '../services/vpnService';
import { onMount } from 'solid-js';
import Button from '../components/common/Button';
import FundsInfo from '../components/FundsInfo';
import { Show } from 'solid-js';

export default function Usage() {
  const [balance, setBalance] = createSignal<BalanceResponse | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = createSignal(false);
  const [balanceError, setBalanceError] = createSignal<string | undefined>();

  async function loadBalance() {
    setIsBalanceLoading(true);
    setBalanceError(undefined);
    try {
      const result = await VPNService.balance();
      console.log('balance', result);
      setBalance(result);
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBalanceLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      await VPNService.refreshNode();
    } catch (_) {
      // ignore refresh errors; follow-up balance fetch will surface issues
    }
    await loadBalance();
  }

  onMount(() => {
    void loadBalance();
  });

  return (
    <SecondaryScreen title="Usage / Budget">
      <div class="p-4 flex flex-col w-full items-center gap-2">
        <Show when={balanceError()}>
          <div class="text-sm text-red-600">{balanceError()}</div>
        </Show>
        <Show when={isBalanceLoading()}>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            Loading balance…
          </div>
        </Show>
        <Show when={!isBalanceLoading() && balance() === null}>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            Not available yet
          </div>
        </Show>
        <Show when={balance()} keyed>
          {b => (
            <>
              <FundsInfo
                name="Safe"
                subtitle="For traffic"
                balance={b.safe}
                ticker="wxHOPR"
                address={b.addresses.safe}
                status="Sufficient"
              />
              <FundsInfo
                name="EOA"
                subtitle="For channels"
                balance={b.node}
                ticker="xDAI"
                address={b.addresses.node}
                status="Sufficient"
              />
            </>
          )}
        </Show>
        <Button
          variant="outline"
          size="sm"
          loading={isBalanceLoading()}
          onClick={() => void handleRefresh()}
        >
          Refresh
        </Button>
      </div>
    </SecondaryScreen>
  );
}
