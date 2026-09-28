import { useCallback, useRef, useState } from 'react';
import { checkPlate, PlateCheckResult } from '../api/plates';
import { extractPlates, OcrText } from './plateParser';
import { PlateTracker } from './PlateTracker';

/** Tiempo que se recuerda que una placa NO está en el listado (evita consultas repetidas) */
const NOT_FOUND_TTL_MS = 2 * 60_000;
/** Tras una alerta, la misma placa no vuelve a alertar durante este tiempo */
export const ALERT_HOLD_MS = 5 * 60_000;
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
}

export function usePlateScanner(onWanted: (hit: WantedHit) => void) {
  const tracker = useRef(new PlateTracker());
  const notFoundCache = useRef(new Map<string, number>());
  const inFlight = useRef(new Set<string>());
  const onWantedRef = useRef(onWanted);
  onWantedRef.current = onWanted;

  const [recent, setRecent] = useState<RecentRead[]>([]);
  const [queries, setQueries] = useState(0);
  const [networkError, setNetworkError] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  const verify = useCallback(async (plate: string, rawText: string) => {
    const cachedAt = notFoundCache.current.get(plate);
    if (cachedAt && Date.now() - cachedAt < NOT_FOUND_TTL_MS) return;
    if (inFlight.current.has(plate)) return;

    inFlight.current.add(plate);
    setQueries(q => q + 1);
    try {
      const result = await checkPlate(plate);
      setNetworkError(false);
      setRecent(prev => [{ plate, found: result.found, at: Date.now() }, ...prev.filter(r => r.plate !== plate)].slice(0, MAX_RECENT));
      if (result.found) {
        tracker.current.hold(plate, ALERT_HOLD_MS);
        onWantedRef.current({ result, rawText, at: Date.now() });
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
  }, []);

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
