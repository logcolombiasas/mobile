import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';
import { colors } from '../theme/colors';

export function UnauthorizedScreen() {
  const { state, signOut } = useAuth();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Sin permisos</Text>
        <Text style={styles.text}>
          El usuario {state.status === 'signedIn' ? state.email : ''} no tiene el rol de moderador.
          Solicita al administrador que te asigne el rol para usar el escáner de placas.
        </Text>
        <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primaryDark, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 24, gap: 12 },
  icon: { fontSize: 42, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', color: colors.text },
  text: { fontSize: 15, color: colors.muted, textAlign: 'center', marginBottom: 8 },
});
