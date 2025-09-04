import Button from './common/Button';
import { useAppStore } from '../stores/appStore';
import { Portal } from 'solid-js/web';

function Navigation() {
  const [appState, appActions] = useAppStore();
  return (
    <Portal>
      <div class="fixed top-20 right-4 z-10 flex flex-col items-stretch gap-2">
        <Button
          variant={
            appState.currentScreen === 'settings' ? 'primary' : 'outline'
          }
          onClick={() => appActions.setScreen('settings')}
        >
          Settings
        </Button>
        <Button
          variant={appState.currentScreen === 'usage' ? 'primary' : 'outline'}
          onClick={() => appActions.setScreen('usage')}
        >
          Usage
        </Button>
        <Button
          variant={appState.currentScreen === 'logs' ? 'primary' : 'outline'}
          onClick={() => appActions.setScreen('logs')}
        >
          Logs
        </Button>
      </div>
    </Portal>
  );
}

export default Navigation;
