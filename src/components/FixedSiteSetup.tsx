import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import type { FixedSite } from '../fixed/useFixedSite';
import { getPositionOnce } from '../location/useCurrentLocation';
import { colors } from '../theme/colors';
import { Button, TextField } from './ui';

/**
 * Configuración de una cámara fija: nombre del lugar (aparece en el historial y en
 * las alertas del panel) y su ubicación GPS, que se toma una sola vez.
 */
export function FixedSiteSetup({ site, onSave, onCancel }: {
  site: FixedSite | null;
  onSave: (site: FixedSite) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(site?.name ?? '');
  const [coords, setCoords] = useState(
    site?.latitude != null && site?.longitude != null ? { latitude: site.latitude, longitude: site.longitude } : null,
  );
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  const locate = async () => {
    setLocating(true);
    setError('');
    const position = await getPositionOnce();
    setLocating(false);
    if (position) setCoords({ latitude: position.latitude, longitude: position.longitude });
    else setError('No fue posible obtener la ubicación. Revisa el permiso de ubicación y el GPS.');
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>📹 Configurar cámara fija</Text>
          <Text style={styles.text}>
            Este dispositivo quedará escaneando placas de forma continua. Cada placa leída se guarda en el
            historial con este lugar, y si está en el listado se notifica al administrador.
          </Text>

          <TextField
            label="Nombre del lugar"
            value={name}
            onChangeText={setName}
            placeholder="Parqueadero Calle 80 - Entrada"
          />

          <Button
            title={coords ? '📍 Actualizar ubicación GPS' : '📍 Tomar ubicación GPS'}
            variant="secondary"
            onPress={locate}
            loading={locating}
          />
          <Text style={styles.coords}>
            {coords ? `Ubicación: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'Sin ubicación GPS (opcional)'}
          </Text>
          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            {onCancel && site && <Button title="Cancelar" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />}
            <Button
              title="Guardar e iniciar"
              disabled={name.trim().length < 3}
              onPress={() => onSave({ name: name.trim(), ...(coords ?? {}) })}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,.6)' },
  card: { backgroundColor: '#f8fafc', borderRadius: 18, padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  text: { fontSize: 14, color: colors.muted, marginBottom: 8 },
  coords: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  error: { color: colors.danger, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
