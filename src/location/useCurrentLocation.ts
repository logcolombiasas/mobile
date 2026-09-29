import { useCallback, useEffect, useRef } from 'react';
import * as Location from 'expo-location';

export interface Coords {
  latitude: number;
  longitude: number;
}

/**
 * Mantiene actualizada la ubicación del celular (cada ~15 s o 25 m) para
 * adjuntarla a cada lectura sin esperar al GPS en el momento de la detección.
 */
export function useCurrentLocation(enabled = true) {
  const coords = useRef<Coords | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (!granted || cancelled) return;
        const last = await Location.getLastKnownPositionAsync();
        if (last) coords.current = last.coords;
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 15_000, distanceInterval: 25 },
          position => { coords.current = position.coords; },
        );
        if (cancelled) subscription.remove();
      } catch (error) {
        console.warn('No fue posible obtener la ubicación', error);
      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return useCallback(() => coords.current, []);
}

/** Lectura puntual del GPS (para fijar la ubicación de una cámara fija) */
export async function getPositionOnce(): Promise<Coords | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return position.coords;
  } catch {
    return null;
  }
}
