import { ComponentType, useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { type CameraViewProps, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Camera, type Text as OcrResult, type TextRecognitionOptions } from 'react-native-vision-camera-ocr-plus';
import { useAuth } from '../auth/AuthContext';
import { Button, PlateBadge } from '../components/ui';
import { WantedAlert } from '../components/WantedAlert';
import { normalizeText } from '../plates/plateParser';
import { usePlateScanner, WantedHit } from '../plates/usePlateScanner';
import { colors } from '../theme/colors';

// El <Camera> del plugin OCR reenvía las props al <Camera> de VisionCamera (style, gestos, torch),
// pero sus tipos solo declaran las props del hook useCamera.
const OcrCamera = Camera as unknown as ComponentType<CameraViewProps & {
  mode: 'recognize';
  options: TextRecognitionOptions;
  callback: (data: unknown) => void;
}>;

export function ScannerScreen() {
  useKeepAwake();
  const { state, signOut } = useAuth();
  const email = state.status === 'signedIn' ? state.email : '';
  const device = useCameraDevice('back');
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();

  const [paused, setPaused] = useState(false);
  const [torch, setTorch] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [alerts, setAlerts] = useState<WantedHit[]>([]);
  const [manual, setManual] = useState('');

  const onWanted = useCallback((hit: WantedHit) => {
    setAlerts(prev => (prev.some(a => a.result.plate === hit.result.plate) ? prev : [...prev, hit]));
  }, []);
  const { onText, verifyManual, recent, queries, networkError, lastSeen } = usePlateScanner(onWanted);

  // Las opciones deben ser estables: el plugin recrea el reconocedor si cambian
  const ocrOptions = useMemo(() => ({ language: 'latin' as const, frameSkipThreshold: 5 }), []);
  const ocrCallback = useCallback((data: unknown) => onText(data as OcrResult), [onText]);

  useEffect(() => {
    if (canRequestPermission) requestPermission();
    Location.requestForegroundPermissionsAsync().catch(() => {});
    const sub = AppState.addEventListener('change', s => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const scanning = hasPermission && !!device && !paused && appActive && alerts.length === 0;

  if (!hasPermission) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.permTitle}>Se necesita acceso a la cámara</Text>
        <Text style={styles.permText}>La cámara se usa para leer las placas de los vehículos en tiempo real.</Text>
        <Button
          title={canRequestPermission ? 'Permitir cámara' : 'Abrir ajustes'}
          onPress={() => (canRequestPermission ? requestPermission() : Linking.openSettings())}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe}>
      {device ? (
        <OcrCamera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={scanning}
          torchMode={torch ? 'on' : 'off'}
          enableNativeZoomGesture
          enableNativeTapToFocusGesture
          mode="recognize"
          options={ocrOptions}
          callback={ocrCallback}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={styles.permText}>No se encontró una cámara trasera.</Text>
        </View>
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Encabezado */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>Logcolombia Placas</Text>
            <Text style={styles.email} numberOfLines={1}>{email}</Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => setTorch(t => !t)}>
            <Text style={styles.iconText}>{torch ? '🔦' : '💡'}</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={signOut}>
            <Text style={styles.iconText}>⎋</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: scanning ? colors.success : '#94a3b8' }]} />
          <Text style={styles.statusText}>
            {scanning ? 'Escaneando placas...' : paused ? 'En pausa' : 'Cámara detenida'} · {queries} consultas
          </Text>
        </View>
        {networkError && (
          <View style={styles.networkBanner}>
            <Text style={styles.networkText}>Sin conexión con el servidor. Reintentando en la próxima lectura…</Text>
          </View>
        )}

        {/* Guía visual */}
        <View style={styles.guideWrap} pointerEvents="none">
          <View style={styles.guide} />
          {lastSeen && scanning && (
            <View style={{ marginTop: 10 }}>
              <PlateBadge plate={lastSeen} size="sm" />
            </View>
          )}
        </View>

        {/* Panel inferior */}
        <View style={styles.panel}>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              value={manual}
              onChangeText={t => setManual(normalizeText(t).slice(0, 7))}
              placeholder="Digitar placa"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={() => { if (manual.length >= 5) { verifyManual(manual); setManual(''); } }}
            />
            <Button
              title="Verificar"
              disabled={manual.length < 5}
              onPress={() => { verifyManual(manual); setManual(''); }}
              style={{ height: 44 }}
            />
            <Button title={paused ? '▶' : '⏸'} variant="secondary" onPress={() => setPaused(p => !p)} style={{ height: 44, width: 52 }} />
          </View>

          <Text style={styles.panelTitle}>Últimas placas verificadas</Text>
          {recent.length === 0 ? (
            <Text style={styles.emptyText}>Apunta la cámara a las placas de los vehículos.</Text>
          ) : (
            <View style={styles.recentList}>
              {recent.map(r => (
                <View key={r.plate} style={styles.recentItem}>
                  <PlateBadge plate={r.plate} size="sm" />
                  <Text style={[styles.recentStatus, { color: r.found ? colors.danger : colors.success }]}>
                    {r.found ? '● EN LISTADO' : '✓ Sin reporte'}
                  </Text>
                  <Text style={styles.recentTime}>{new Date(r.at).toLocaleTimeString()}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </SafeAreaView>

      {alerts[0] && (
        <WantedAlert
          key={alerts[0].result.plate + alerts[0].at}
          hit={alerts[0]}
          email={email}
          onClose={() => setAlerts(prev => prev.slice(1))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  permText: { color: '#cbd5e1', fontSize: 15, textAlign: 'center', marginBottom: 8 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  brand: { color: '#fff', fontSize: 18, fontWeight: '800' },
  email: { color: '#cbd5e1', fontSize: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontSize: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#fff', fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  networkBanner: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#f59e0b', borderRadius: 8, padding: 8 },
  networkText: { color: '#111', fontWeight: '600', fontSize: 12 },
  guideWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  guide: { width: '78%', aspectRatio: 3.2, borderWidth: 3, borderColor: 'rgba(255,212,0,.9)', borderRadius: 12 },
  panel: { backgroundColor: 'rgba(15,23,42,.88)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 },
  manualRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  manualInput: {
    flex: 1, height: 44, borderRadius: 10, backgroundColor: '#1e293b', color: '#fff',
    paddingHorizontal: 12, fontSize: 16, fontWeight: '700', letterSpacing: 2,
  },
  panelTitle: { color: '#cbd5e1', fontWeight: '700', fontSize: 13 },
  emptyText: { color: '#94a3b8', fontSize: 13 },
  recentList: { gap: 6 },
  recentItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentStatus: { fontWeight: '800', fontSize: 12, flex: 1 },
  recentTime: { color: '#94a3b8', fontSize: 11 },
});
