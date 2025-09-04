import './App.css';
import { MainScreen } from './screens/MainScreen';
import { AppStoreProvider } from './stores/appContext';
import Navigation from './components/Navigation';

function App() {
  return (
    <AppStoreProvider>
      <div class="h-screen bg-gray-50 dark:bg-gray-900">
        <MainScreen />
        <Navigation />
      </div>
    </AppStoreProvider>
  );
}

export default App;
