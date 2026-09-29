import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Lugar donde está instalada una cámara fija (ej. "Parqueadero Calle 80 - Entrada") */
export interface FixedSite {
  name: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  address?: string;
}

const STORAGE_KEY = 'fixed.site';

export function useFixedSite() {
  const [site, setSite] = useState<FixedSite | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => setSite(value ? JSON.parse(value) : null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const saveSite = useCallback(async (next: FixedSite) => {
    setSite(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return { site, loaded, saveSite };
}
