/**
 * Filtra las lecturas del OCR para evitar consultas por lecturas falsas:
 * una placa se "confirma" cuando se lee al menos `minHits` veces dentro de
 * `windowMs`. Luego queda en espera (`cooldownMs`) para no consultarla de nuevo
 * en cada frame mientras siga en cámara.
 */
export interface TrackerOptions {
  minHits: number;
  windowMs: number;
  cooldownMs: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  minHits: 2,
  windowMs: 2500,
  cooldownMs: 60_000,
};

export class PlateTracker {
  private sightings = new Map<string, number[]>();
  private cooldownUntil = new Map<string, number>();

  constructor(private options: TrackerOptions = DEFAULT_TRACKER_OPTIONS) {}

  /** Registra las placas leídas en un frame y devuelve las que se acaban de confirmar. */
  push(plates: string[], now = Date.now()): string[] {
    const confirmed: string[] = [];
    for (const plate of new Set(plates)) {
      if ((this.cooldownUntil.get(plate) ?? 0) > now) continue;
      const hits = (this.sightings.get(plate) ?? []).filter(t => now - t <= this.options.windowMs);
      hits.push(now);
      if (hits.length >= this.options.minHits) {
        this.sightings.delete(plate);
        this.cooldownUntil.set(plate, now + this.options.cooldownMs);
        confirmed.push(plate);
      } else {
        this.sightings.set(plate, hits);
      }
    }
    this.cleanup(now);
    return confirmed;
  }

  /** Permite volver a evaluar una placa (ej. si la consulta falló por red) */
  release(plate: string) {
    this.cooldownUntil.delete(plate);
  }

  /** Mantiene una placa en espera por un tiempo específico (ej. tras una alerta) */
  hold(plate: string, ms: number, now = Date.now()) {
    this.cooldownUntil.set(plate, now + ms);
  }

  private cleanup(now: number) {
    if (this.sightings.size < 200 && this.cooldownUntil.size < 500) return;
    for (const [plate, hits] of this.sightings) {
      if (hits.every(t => now - t > this.options.windowMs)) this.sightings.delete(plate);
    }
    for (const [plate, until] of this.cooldownUntil) {
      if (until <= now) this.cooldownUntil.delete(plate);
    }
  }
}
