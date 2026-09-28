import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { createDetection, DetectionStatus, updateDetectionStatus } from '../api/plates';
import type { WantedHit } from '../plates/usePlateScanner';
import { colors } from '../theme/colors';
import { Button, PlateBadge } from './ui';

const VIBRATION_PATTERN = [0, 600, 300, 600, 300, 600];

async function currentPosition() {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30_000 });
    if (last) return last.coords;
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 5000));
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout,
    ]);
    return fresh?.coords ?? null;
  } catch {
    return null;
  }
}

export function WantedAlert({ hit, email, onClose }: { hit: WantedHit; email: string; onClose: () => void }) {
  const player = useAudioPlayer(require('../../assets/sounds/alarm.wav'));
  const detectionId = useRef<Promise<string | undefined> | null>(null);
  const [saving, setSaving] = useState<DetectionStatus | null>(null);
  const [error, setError] = useState('');
  const { result } = hit;

  useEffect(() => {
    // Alarma sonora + vibración hasta que el operario responda
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    player.loop = true;
    player.play();
    Vibration.vibrate(VIBRATION_PATTERN, true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

    // Se registra la detección de inmediato para que el panel web la vea en tiempo real
    detectionId.current = (async () => {
      const coords = await currentPosition();
      try {
        return await createDetection({
          plate: result.plate,
          rawText: hit.rawText,
          wantedPlateId: result.id,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          detectedBy: email,
        });
      } catch (e) {
        console.warn('No se pudo registrar la detección', e);
        return undefined;
      }
    })();

    return () => {
      Vibration.cancel();
      try { player.pause(); } catch {}
    };
  }, []);

  const silence = () => {
    Vibration.cancel();
    try { player.pause(); } catch {}
  };

  const resolve = async (status: DetectionStatus) => {
    silence();
    setSaving(status);
    setError('');
    try {
      const id = await detectionId.current;
      if (id) await updateDetectionStatus(id, status);
      onClose();
    } catch (e) {
      setError('No se pudo actualizar el estado. Revisa la conexión e intenta de nuevo.');
    } finally {
      setSaving(null);
    }
  };

  const rows: [string, string | null | undefined][] = [
    ['Vehículo', [result.vehicleType, result.brand, result.line].filter(Boolean).join(' · ')],
    ['Color', result.color],
    ['Modelo', result.modelYear],
    ['Motivo', result.reason],
    ['Prioridad', result.priority],
    ['Observaciones', result.notes],
  ];

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => resolve('alerta')}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.siren}>🚨</Text>
          <Text style={styles.title}>VEHÍCULO EN EL LISTADO</Text>
          <Text style={styles.subtitle}>Inicia de inmediato la gestión de captura</Text>

          <View style={styles.plateWrap}>
            <PlateBadge plate={result.plate} size="lg" />
          </View>

          <View style={styles.card}>
            {rows.filter(([, v]) => !!v).map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue}>{value}</Text>
              </View>
            ))}
            <Text style={styles.time}>Detectado: {new Date(hit.at).toLocaleTimeString()}</Text>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Button title="Iniciar gestión de captura" variant="success" onPress={() => resolve('en_gestion')} loading={saving === 'en_gestion'} />
            <Button title="Silenciar alarma" variant="secondary" onPress={silence} />
            <Button title="Falso positivo (la placa no coincide)" variant="secondary" onPress={() => resolve('falso_positivo')} loading={saving === 'falso_positivo'} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.danger },
  content: { padding: 20, paddingBottom: 40 },
  siren: { fontSize: 56, textAlign: 'center', marginTop: 8 },
  title: { fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#fee2e2', textAlign: 'center', marginTop: 4 },
  plateWrap: { alignItems: 'center', marginVertical: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  row: { flexDirection: 'row', gap: 12 },
  rowLabel: { width: 110, color: colors.muted, fontWeight: '600' },
  rowValue: { flex: 1, color: colors.text, fontWeight: '700' },
  time: { color: colors.muted, fontSize: 12, marginTop: 4 },
  error: { color: '#fff', fontWeight: '700', marginTop: 12, textAlign: 'center' },
  actions: { gap: 10, marginTop: 20 },
});
