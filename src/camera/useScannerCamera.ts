import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type CameraDevice, useCameraDevices } from 'react-native-vision-camera';
import { buildCameraOptions, pickCamera } from './cameraOptions';

const STORAGE_KEY = 'scanner.cameraId';

/**
 * Cámara que usa el escáner. Recuerda la elección del usuario y cambia
 * automáticamente a una cámara externa cuando se conecta por USB.
 */
export function useScannerCamera() {
  const devices = useCameraDevices();
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [device, setDevice] = useState<CameraDevice | undefined>();
  const previousIds = useRef<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(id => setPreferredId(id))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const next = pickCamera(devices, preferredId, previousIds.current) as CameraDevice | undefined;
    previousIds.current = devices.map(d => d.id);
    setDevice(prev => (prev?.id === next?.id ? prev : next));
  }, [devices, preferredId, loaded]);

  const options = useMemo(() => buildCameraOptions(devices), [devices]);

  const selectCamera = useCallback((id: string) => {
    setPreferredId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }, []);

  const current = options.find(o => o.id === device?.id);
  return { device, options, current, selectCamera };
}
