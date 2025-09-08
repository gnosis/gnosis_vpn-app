import Button from './common/Button';
import { useAppStore } from '../stores/appStore';
import { Portal } from 'solid-js/web';

function Navigation() {
  const [appState, appActions] = useAppStore();
  return (
    <Portal>
      <div class="w-full fixed bottom-4 z-10 flex items-center gap-2 justify-center">
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
