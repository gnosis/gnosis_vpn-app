import { createContext, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import createAppStore, { type AppStoreTuple } from './appStore';

export const AppStoreContext = createContext<AppStoreTuple>();

export function AppStoreProvider(props: { children: JSX.Element }) {
  const store = createAppStore();
  const [, actions] = store;

  onMount(() => {
    void actions.updateStatus();
    actions.startStatusPolling(2000);
  });

  onCleanup(() => {
    actions.stopStatusPolling();
  });

  return (
    <AppStoreContext.Provider value={store}>
      {props.children}
    </AppStoreContext.Provider>
  );
}
