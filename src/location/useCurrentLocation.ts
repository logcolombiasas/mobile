import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { distanceMeters, formatAddress } from './address';

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface LocationFix extends Coords {
  accuracy?: number;
  address?: string;
  /** Momento (ms) en que se obtuvo la posición */
  at: number;
}

/** Una posición más vieja que esto se considera desactualizada para guardar una lectura */
const MAX_AGE_MS = 20_000;
/** Tiempo máximo que se espera al GPS antes de guardar la lectura sin posición nueva */
const FIX_TIMEOUT_MS = 5_000;
/** Se vuelve a calcular la dirección cuando el celular se mueve más de esto */
const GEOCODE_EVERY_M = 40;

async function reverseGeocode(coords: Coords): Promise<string | undefined> {
  try {
    const [result] = await Location.reverseGeocodeAsync(coords);
    return formatAddress(result);
  } catch {
    return undefined; // sin internet o sin servicio de geocodificación: se guardan solo las coordenadas
  }
}

/**
 * Ubicación del celular para adjuntar a cada lectura:
 *  - GPS de alta precisión en seguimiento continuo (cada ~5 s o 10 m).
 *  - Dirección de la calle (geocodificación inversa) cuando cambia la posición.
 *  - `getFix()` garantiza una posición reciente antes de guardar una lectura.
 */
export function useCurrentLocation(enabled = true) {
  const fix = useRef<LocationFix | null>(null);
  const geocodedAt = useRef<Coords | null>(null);
  const [permission, setPermission] = useState(true);
  const [current, setCurrent] = useState<LocationFix | null>(null);

  const update = useCallback(async (position: Location.LocationObject) => {
    const next: LocationFix = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      address: fix.current?.address,
      at: position.timestamp || Date.now(),
    };
    fix.current = next;
    setCurrent(next);
    if (!geocodedAt.current || distanceMeters(geocodedAt.current, next) > GEOCODE_EVERY_M) {
      geocodedAt.current = next;
      const address = await reverseGeocode(next);
      if (address && fix.current) {
        fix.current = { ...fix.current, address };
        setCurrent(fix.current);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        setPermission(granted);
        if (!granted || cancelled) return;
        const last = await Location.getLastKnownPositionAsync();
        if (last) update(last);
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 10 },
          update,
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
  }, [enabled, update]);

  /** Posición para guardar una lectura: si la última es vieja, pide una nueva (máx. 5 s) */
  const getFix = useCallback(async (): Promise<LocationFix | null> => {
    const cached = fix.current;
    if (cached && Date.now() - cached.at < MAX_AGE_MS) return cached;
    try {
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), FIX_TIMEOUT_MS));
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        timeout,
      ]);
      if (position) await update(position);
    } catch {
      // se usa la última conocida
    }
    return fix.current;
  }, [update]);

  return { getFix, current, permission };
}

/** Lectura puntual del GPS con dirección (para fijar la ubicación de una cámara fija) */
export async function getPositionOnce(): Promise<(Coords & { accuracy?: number; address?: string }) | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    return { ...coords, accuracy: position.coords.accuracy ?? undefined, address: await reverseGeocode(coords) };
  } catch {
    return null;
  }
}
