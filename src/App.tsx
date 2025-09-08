import './App.css';
import { MainScreen } from './screens/MainScreen';
import Navigation from './components/Navigation';
import { Dynamic } from 'solid-js/web';
import Logs from './screens/Logs';
import Settings from './screens/Settings';
import { useAppStore } from './stores/appStore';
import Usage from './screens/Usage';
import { onCleanup, onMount } from 'solid-js';

const screens = {
  main: MainScreen,
  logs: Logs,
  settings: Settings,
  usage: Usage,
};

function App() {
  const [appState, appActions] = useAppStore();

  onMount(() => {
    void (async () => {
      await appActions.refreshStatus();
      appActions.startStatusPolling(2000);
    })();
  });

  onCleanup(() => {
    appActions.stopStatusPolling();
  });

  return (
    <>
      <div class="h-screen bg-gray-50 dark:bg-gray-900">
        <Dynamic component={screens[appState.currentScreen]} />
      </div>
      <Navigation />
    </>
  );
}

export default App;
