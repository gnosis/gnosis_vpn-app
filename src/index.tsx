/* @refresh reload */
import { render } from 'solid-js/web';
import App from './App';
import { AppStoreProvider } from './stores/appContext';

render(
  () => (
    <AppStoreProvider>
      {' '}
      <App />{' '}
    </AppStoreProvider>
  ),
  document.getElementById('root') as HTMLElement
);
