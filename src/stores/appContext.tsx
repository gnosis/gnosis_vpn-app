import { createContext } from 'solid-js';
import type { JSX } from 'solid-js';
import createAppStore, { type AppStoreTuple } from './appStore';

export const AppStoreContext = createContext<AppStoreTuple>();

export function AppStoreProvider(props: { children: JSX.Element }) {
  const store = createAppStore();
  return (
    <AppStoreContext.Provider value={store}>
      {props.children}
    </AppStoreContext.Provider>
  );
}
