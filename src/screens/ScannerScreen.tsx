import { ComponentType, useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Image, Linking, Modal, Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { type CameraViewProps, useCameraPermission } from 'react-native-vision-camera';
import { Camera, type Text as OcrResult, type TextRecognitionOptions } from 'react-native-vision-camera-ocr-plus';
import { createDetection, type SightingContext } from '../api/plates';
import { type ScanMode, useAuth } from '../auth/AuthContext';
import { useScannerCamera } from '../camera/useScannerCamera';
import { FixedSiteSetup } from '../components/FixedSiteSetup';
import { Button, PlateBadge } from '../components/ui';
import { WantedAlert } from '../components/WantedAlert';
import { useFixedSite } from '../fixed/useFixedSite';
import { useCurrentLocation } from '../location/useCurrentLocation';
import { normalizeText } from '../plates/plateParser';
import { usePlateScanner, WantedHit } from '../plates/usePlateScanner';
import { colors } from '../theme/colors';

const MAX_FIXED_ALERTS = 5;

// El <Camera> del plugin OCR reenvía las props al <Camera> de VisionCamera (style, gestos, torch),
// pero sus tipos solo declaran las props del hook useCamera.
const OcrCamera = Camera as unknown as ComponentType<CameraViewProps & {
  mode: 'recognize';
  options: TextRecognitionOptions;
  callback: (data: unknown) => void;
}>;

/**
 * Escáner de placas.
 *  - mode 'movil': operario con el celular; alerta a pantalla completa.
 *  - mode 'fija': dispositivo instalado en un lugar (ej. parqueadero); escanea de forma
 *    continua, registra la detección y notifica al administrador sin esperar a nadie.
 */
export function ScannerScreen({ mode }: { mode: ScanMode }) {
  useKeepAwake();
  const fixed = mode === 'fija';
  const { state, signOut } = useAuth();
  const email = state.status === 'signedIn' ? state.email : '';
  const { site, loaded: siteLoaded, saveSite } = useFixedSite();
  const [siteEditor, setSiteEditor] = useState(false);
  const [fixedAlerts, setFixedAlerts] = useState<(WantedHit & { saved: boolean })[]>([]);
  const alarm = useAudioPlayer(require('../../assets/sounds/alarm.wav'));
  const getCoords = useCurrentLocation(!fixed);
  const { device, options: cameraOptions, current: currentCamera, selectCamera } = useScannerCamera();
  const [cameraPicker, setCameraPicker] = useState(false);
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();

  const [paused, setPaused] = useState(false);
  const [torch, setTorch] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [alerts, setAlerts] = useState<WantedHit[]>([]);
  const [manual, setManual] = useState('');

  const getContext = useCallback((): SightingContext => {
    if (fixed) {
      return {
        sourceType: 'fija',
        sourceName: email,
        locationName: site?.name,
        latitude: site?.latitude,
        longitude: site?.longitude,
      };
    }
    const coords = getCoords();
    return {
      sourceType: 'movil',
      sourceName: email,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    };
  }, [fixed, email, site, getCoords]);

  /** Cámara fija: registra la detección (notifica al admin) y sigue escaneando */
  const onFixedHit = useCallback(async (hit: WantedHit) => {
    try {
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      alarm.seekTo(0);
      alarm.play();
    } catch {}
    Vibration.vibrate(800);
    let saved = false;
    try {
      await createDetection({
        plate: hit.result.plate,
        rawText: hit.rawText,
        wantedPlateId: hit.result.id,
        latitude: hit.context.latitude,
        longitude: hit.context.longitude,
        locationName: hit.context.locationName,
        sourceType: 'fija',
        detectedBy: email,
      });
      saved = true;
    } catch (error) {
      console.warn('No se pudo registrar la detección', error);
    }
    setFixedAlerts(prev => [{ ...hit, saved }, ...prev].slice(0, MAX_FIXED_ALERTS));
  }, [alarm, email]);

  const onWanted = useCallback((hit: WantedHit) => {
    if (fixed) {
      onFixedHit(hit);
      return;
    }
    setAlerts(prev => (prev.some(a => a.result.plate === hit.result.plate) ? prev : [...prev, hit]));
  }, [fixed, onFixedHit]);
  const { onText, verifyManual, recent, queries, networkError, lastSeen } = usePlateScanner(onWanted, getContext, mode);

  // Las opciones deben ser estables: el plugin recrea el reconocedor si cambian
  const ocrOptions = useMemo(() => ({ language: 'latin' as const, frameSkipThreshold: 5 }), []);
  const ocrCallback = useCallback((data: unknown) => onText(data as OcrResult), [onText]);

  useEffect(() => {
    if (canRequestPermission) requestPermission();
    const sub = AppState.addEventListener('change', s => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // En modo fijo no se detiene con las alertas; solo necesita el lugar configurado
  const scanning = hasPermission && !!device && !paused && appActive && (fixed ? !!site : alerts.length === 0);

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
          key={device.id}
          torchMode={torch && device.hasTorch ? 'on' : 'off'}
          enableNativeZoomGesture
          enableNativeTapToFocusGesture
          mode="recognize"
          options={ocrOptions}
          callback={ocrCallback}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={styles.permText}>No se encontró ninguna cámara.</Text>
        </View>
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Encabezado */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            {fixed
              ? <Text style={styles.brand}>📹 Cámara fija</Text>
              : <Image source={require('../../assets/logo_dark.png')} style={styles.logo} resizeMode="contain" />}
            <Text style={styles.email} numberOfLines={1}>{fixed ? site?.name ?? 'Sin configurar' : email}</Text>
          </View>
          {fixed && (
            <Pressable style={styles.iconBtn} onPress={() => setSiteEditor(true)}>
              <Text style={styles.iconText}>⚙️</Text>
            </Pressable>
          )}
          <Pressable style={styles.iconBtn} onPress={() => setCameraPicker(true)}>
            <Text style={styles.iconText}>📷</Text>
          </Pressable>
          {device?.hasTorch && (
            <Pressable style={styles.iconBtn} onPress={() => setTorch(t => !t)}>
              <Text style={styles.iconText}>{torch ? '🔦' : '💡'}</Text>
            </Pressable>
          )}
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
        {currentCamera && (
          <Pressable onPress={() => setCameraPicker(true)} style={styles.cameraChip}>
            <Text style={styles.cameraChipText}>
              {currentCamera.external ? '🔌 ' : '📱 '}{currentCamera.label}
            </Text>
          </Pressable>
        )}
        {networkError && (
          <View style={styles.networkBanner}>
            <Text style={styles.networkText}>Sin conexión con el servidor. Reintentando en la próxima lectura…</Text>
          </View>
        )}
        {fixed && fixedAlerts.length > 0 && (
          <View style={styles.fixedAlerts}>
            <View style={styles.fixedAlertsHeader}>
              <Text style={styles.fixedAlertsTitle}>🚨 Vehículos del listado detectados</Text>
              <Pressable onPress={() => setFixedAlerts([])}>
                <Text style={styles.fixedAlertsClear}>Limpiar</Text>
              </Pressable>
            </View>
            {fixedAlerts.map(a => (
              <View key={a.result.plate + a.at} style={styles.fixedAlertItem}>
                <PlateBadge plate={a.result.plate} size="sm" />
                <Text style={styles.fixedAlertText} numberOfLines={1}>
                  {[a.result.brand, a.result.color].filter(Boolean).join(' ') || a.result.reason}
                </Text>
                <Text style={styles.fixedAlertTime}>
                  {new Date(a.at).toLocaleTimeString()} {a.saved ? '· notificado' : '· sin enviar'}
                </Text>
              </View>
            ))}
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

      <Modal visible={cameraPicker} transparent animationType="slide" onRequestClose={() => setCameraPicker(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCameraPicker(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>Cámara para escanear</Text>
            {cameraOptions.map(option => (
              <Pressable
                key={option.id}
                style={[styles.sheetItem, option.id === device?.id && styles.sheetItemActive]}
                onPress={() => { selectCamera(option.id); setTorch(false); setCameraPicker(false); }}
              >
                <Text style={styles.sheetItemText}>{option.external ? '🔌 ' : '📱 '}{option.label}</Text>
                {option.id === device?.id && <Text style={styles.sheetCheck}>✓</Text>}
              </Pressable>
            ))}
            <Text style={styles.sheetHint}>
              Puedes conectar una cámara USB (webcam, capturadora HDMI→USB o una GoPro en modo webcam).
              Al conectarla, la app cambia a ella automáticamente. En iPhone solo están disponibles las
              cámaras del celular.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      {fixed && siteLoaded && (!site || siteEditor) && (
        <FixedSiteSetup
          site={site}
          onSave={next => { saveSite(next); setSiteEditor(false); }}
          onCancel={() => setSiteEditor(false)}
        />
      )}

      {!fixed && alerts[0] && (
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
  logo: { width: 120, height: 52 },
  email: { color: '#cbd5e1', fontSize: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontSize: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#fff', fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  cameraChip: {
    alignSelf: 'flex-start', marginLeft: 16, marginTop: 6, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, backgroundColor: 'rgba(0,0,0,.5)',
  },
  cameraChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 6 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  sheetItemActive: { backgroundColor: '#fde8e9' },
  sheetItemText: { flex: 1, fontSize: 16, color: colors.text },
  sheetCheck: { fontSize: 18, color: colors.primary, fontWeight: '800' },
  sheetHint: { fontSize: 12, color: colors.muted, marginTop: 8 },
  fixedAlerts: { marginHorizontal: 16, marginTop: 8, backgroundColor: 'rgba(220,38,38,.92)', borderRadius: 12, padding: 10, gap: 6 },
  fixedAlertsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fixedAlertsTitle: { color: '#fff', fontWeight: '800' },
  fixedAlertsClear: { color: '#fee2e2', fontWeight: '600', fontSize: 12 },
  fixedAlertItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fixedAlertText: { color: '#fff', flex: 1, fontSize: 12 },
  fixedAlertTime: { color: '#fee2e2', fontSize: 11 },
  networkBanner: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#f59e0b', borderRadius: 8, padding: 8 },
  networkText: { color: '#111', fontWeight: '600', fontSize: 12 },
  guideWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  guide: { width: '78%', aspectRatio: 3.2, borderWidth: 3, borderColor: 'rgba(237,28,36,.9)', borderRadius: 12 },
  panel: { backgroundColor: 'rgba(5,7,7,.88)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 },
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
