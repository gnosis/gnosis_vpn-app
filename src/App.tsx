import './App.css';
import { MainScreen } from './screens/MainScreen';
import { AppStoreProvider } from './stores/appStore.tsx';

function App() {
  return (
    <AppStoreProvider>
      <div class="h-screen bg-gray-50 dark:bg-gray-900">
        <MainScreen />
      </div>
    </AppStoreProvider>
  );
}

export default App;
