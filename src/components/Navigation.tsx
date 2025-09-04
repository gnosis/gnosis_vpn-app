import Button from './common/Button';
import LogsPanel from './LogsPanel';
import Modal from './common/Modal';
import SettingsPanel from './SettingsPanel';
import { useAppStore } from '../stores/appStore';

function Navigation() {
  const [appState, appActions] = useAppStore();
  return (
    <>
      <div class="fixed top-4 right-4 z-50 flex flex-col items-stretch gap-2">
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

      <Modal
        open={appState.currentScreen === 'settings'}
        title="Settings"
        onClose={() => appActions.setScreen('main')}
      >
        <SettingsPanel />
      </Modal>

      <Modal
        open={appState.currentScreen === 'logs'}
        title="Logs"
        onClose={() => appActions.setScreen('main')}
      >
        <LogsPanel />
      </Modal>

      <Modal
        open={appState.currentScreen === 'usage'}
        title="Usage"
        onClose={() => appActions.setScreen('main')}
      >
        <div>Usage</div>
      </Modal>
    </>
  );
}

export default Navigation;
