import 'react-native-get-random-values';
import './src/config/amplify';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { UnauthorizedScreen } from './src/screens/UnauthorizedScreen';
import { colors } from './src/theme/colors';

function Root() {
  const { state, canScan, mode } = useAuth();

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryDark }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }
  if (state.status !== 'signedIn') return <LoginScreen />;
  if (!canScan || !mode) return <UnauthorizedScreen />;
  return <ScannerScreen mode={mode} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
