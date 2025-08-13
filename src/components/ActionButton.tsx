import { Match, Switch } from 'solid-js';
import Button from './common/Button';
import { isConnected, type Status, type Destination } from '../types';

function ActionButton(props: {
  status: Status;
  onConnect: (destination?: Destination) => void;
  onDisconnect: () => void;
  isLoading: boolean;
}) {
  return (
    <div class="mt-6 flex justify-center">
      <Switch>
        <Match when={isConnected(props.status)}>
          <Button
            variant="primary"
            size="lg"
            loading={props.isLoading}
            onClick={() => props.onDisconnect()}
          >
            Disconnect
          </Button>
        </Match>
        <Match when={!isConnected(props.status)}>
          <Button
            variant="primary"
            size="lg"
            loading={props.isLoading}
            onClick={() => props.onConnect()}
          >
            Connect
          </Button>
        </Match>
      </Switch>
    </div>
  );
}

export default ActionButton;
