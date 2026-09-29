import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { translateAuthError, useAuth } from '../auth/AuthContext';
import { Button, TextField } from '../components/ui';
import { colors } from '../theme/colors';

export function LoginScreen() {
  const { state, signIn, confirmNewPassword } = useAuth();
  const newPassword = state.status === 'newPasswordRequired';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (newPassword && password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      if (newPassword) await confirmNewPassword(password);
      else await signIn(email, password);
    } catch (e) {
      setError(translateAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.header}>
          <Image source={require('../../assets/logo_dark.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Placas</Text>
          <Text style={styles.subtitle}>
            {newPassword ? 'Es tu primer ingreso: define una nueva contraseña.' : 'Ingresa con el usuario asignado por el administrador.'}
          </Text>
        </View>

        <View style={styles.card}>
          {newPassword ? (
            <>
              <TextField label="Nueva contraseña" secureTextEntry value={password} onChangeText={setPassword} />
              <TextField label="Confirmar contraseña" secureTextEntry value={confirm} onChangeText={setConfirm} />
            </>
          ) : (
            <>
              <TextField
                label="Correo"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="usuario@correo.com"
              />
              <TextField label="Contraseña" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} />
            </>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Button
            title={newPassword ? 'Guardar contraseña' : 'Ingresar'}
            onPress={submit}
            loading={loading}
            disabled={newPassword ? !password || !confirm : !email || !password}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primaryDark },
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  header: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 280, height: 122, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 4, textTransform: 'uppercase' },
  subtitle: { fontSize: 14, color: '#cbd5e1', textAlign: 'center', marginTop: 6 },
  card: { backgroundColor: '#f8fafc', borderRadius: 18, padding: 20, borderTopWidth: 4, borderTopColor: colors.primary },
  error: { color: colors.danger, marginBottom: 12, fontWeight: '600' },
});
