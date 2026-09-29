import { useCallback, useRef, useState } from 'react';
import { PlateCheckResult, reportSighting, SightingContext, SourceType } from '../api/plates';
import { extractPlates, OcrText } from './plateParser';
import { PlateTracker } from './PlateTracker';

/**
 * Tiempos según el modo:
 *  - movil: el operario pasa junto a los vehículos, se repiten pocas veces.
 *  - fija: la cámara del parqueadero ve el mismo vehículo estacionado por horas;
 *    se registra como mucho una vez cada 10 minutos para no llenar el historial.
 */
export const SCAN_TIMINGS: Record<SourceType, { cooldownMs: number; notFoundTtlMs: number; alertHoldMs: number }> = {
  movil: { cooldownMs: 60_000, notFoundTtlMs: 2 * 60_000, alertHoldMs: 5 * 60_000 },
  fija: { cooldownMs: 10 * 60_000, notFoundTtlMs: 10 * 60_000, alertHoldMs: 30 * 60_000 },
};
const MAX_RECENT = 8;
const MAX_CANDIDATES_PER_FRAME = 4;

export interface RecentRead {
  plate: string;
  found: boolean;
  at: number;
}

export interface WantedHit {
  result: PlateCheckResult;
  rawText: string;
  at: number;
  context: SightingContext;
}

/**
 * Orquesta OCR → confirmación → reportSighting (verifica y guarda en el historial) → alerta.
 * `getContext` devuelve la ubicación y la fuente al momento de cada lectura.
 */
export function usePlateScanner(
  onWanted: (hit: WantedHit) => void,
  getContext: () => SightingContext,
  sourceType: SourceType = 'movil',
) {
  const timings = SCAN_TIMINGS[sourceType];
  const tracker = useRef(new PlateTracker({ minHits: 2, windowMs: 2500, cooldownMs: timings.cooldownMs }));
  const notFoundCache = useRef(new Map<string, number>());
  const inFlight = useRef(new Set<string>());
  const onWantedRef = useRef(onWanted);
  onWantedRef.current = onWanted;
  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;

  const [recent, setRecent] = useState<RecentRead[]>([]);
  const [queries, setQueries] = useState(0);
  const [networkError, setNetworkError] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  const verify = useCallback(async (plate: string, rawText: string) => {
    const cachedAt = notFoundCache.current.get(plate);
    if (cachedAt && Date.now() - cachedAt < timings.notFoundTtlMs) return;
    if (inFlight.current.has(plate)) return;

    inFlight.current.add(plate);
    setQueries(q => q + 1);
    try {
      const context = getContextRef.current();
      const result = await reportSighting(plate, rawText, context);
      setNetworkError(false);
      setRecent(prev => [{ plate, found: result.found, at: Date.now() }, ...prev.filter(r => r.plate !== plate)].slice(0, MAX_RECENT));
      if (result.found) {
        tracker.current.hold(plate, timings.alertHoldMs);
        onWantedRef.current({ result, rawText, at: Date.now(), context });
      } else {
        notFoundCache.current.set(plate, Date.now());
      }
    } catch (error) {
      console.warn('Error consultando placa', plate, error);
      setNetworkError(true);
      // Se libera para reintentar en la próxima lectura
      tracker.current.release(plate);
    } finally {
      inFlight.current.delete(plate);
    }
  }, [timings]);

  /** Recibe cada resultado de OCR del frame processor */
  const onText = useCallback((text: OcrText) => {
    if (!text?.resultText) return;
    const candidates = extractPlates(text).slice(0, MAX_CANDIDATES_PER_FRAME).map(c => c.plate);
    if (!candidates.length) return;
    setLastSeen(prev => (prev === candidates[0] ? prev : candidates[0]));
    for (const plate of tracker.current.push(candidates)) {
      verify(plate, text.resultText.slice(0, 200));
    }
  }, [verify]);

  /** Permite digitar una placa manualmente (ej. placa sucia o de noche) */
  const verifyManual = useCallback((plate: string) => {
    notFoundCache.current.delete(plate);
    tracker.current.release(plate);
    return verify(plate, 'manual');
  }, [verify]);

  return { onText, verifyManual, recent, queries, networkError, lastSeen };
}
