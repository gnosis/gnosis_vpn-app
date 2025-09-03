import Button from './common/Button';
import type { AppScreen } from '../types';

function Navigation(props: {
  currentScreen: AppScreen;
  onNavigate: (s: AppScreen) => void;
}) {
  return (
    <div class="mt-8 flex items-center justify-center gap-2">
      <Button
        variant={props.currentScreen === 'settings' ? 'primary' : 'outline'}
        onClick={() => props.onNavigate('settings')}
      >
        Settings
      </Button>
      <Button
        variant={props.currentScreen === 'logs' ? 'primary' : 'outline'}
        onClick={() => props.onNavigate('logs')}
      >
        Logs
      </Button>
    </div>
  );
}

export default Navigation;
