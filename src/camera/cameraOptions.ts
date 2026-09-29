/**
 * Lista y selección de cámaras disponibles para escanear: cámaras del celular
 * (trasera, gran angular, teleobjetivo, frontal) y cámaras externas USB/UVC
 * (webcams, capturadoras HDMI→USB, GoPro en modo webcam UVC).
 */

/** Campos de CameraDevice (VisionCamera) que usa la app */
export interface CameraLike {
  id: string;
  position: 'front' | 'back' | 'external' | 'unspecified';
  type: string;
  localizedName: string;
  isVirtualDevice: boolean;
}

export interface CameraOption {
  id: string;
  label: string;
  group: 'Celular' | 'Externa';
  external: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  'wide-angle': 'Principal',
  'ultra-wide-angle': 'Gran angular',
  telephoto: 'Teleobjetivo',
  dual: 'Automática (dual)',
  'dual-wide': 'Automática (dual)',
  triple: 'Automática (triple)',
  quad: 'Automática',
};

const IGNORED_TYPES = ['lidar-depth', 'true-depth', 'time-of-flight-depth'];

export function isExternal(device: CameraLike) {
  return device.position === 'external' || device.type === 'external';
}

/** Orden: externas primero (si se conectó una es porque se quiere usar), luego traseras y frontal */
export function buildCameraOptions(devices: CameraLike[]): CameraOption[] {
  const rank = (d: CameraLike) => (isExternal(d) ? 0 : d.position === 'back' ? (d.isVirtualDevice ? 1 : 2) : 3);
  const options: CameraOption[] = [];
  const usedLabels = new Map<string, number>();

  [...devices]
    .filter(d => !IGNORED_TYPES.includes(d.type))
    .sort((a, b) => rank(a) - rank(b))
    .forEach(d => {
      let label: string;
      if (isExternal(d)) {
        label = `Externa: ${d.localizedName || 'Cámara USB'}`;
      } else if (d.position === 'front') {
        label = 'Frontal';
      } else {
        label = `Trasera ${TYPE_LABELS[d.type] ?? d.localizedName ?? ''}`.trim();
      }
      // Evita etiquetas repetidas (ej. dos cámaras USB del mismo modelo)
      const count = (usedLabels.get(label) ?? 0) + 1;
      usedLabels.set(label, count);
      options.push({
        id: d.id,
        label: count > 1 ? `${label} (${count})` : label,
        group: isExternal(d) ? 'Externa' : 'Celular',
        external: isExternal(d),
      });
    });
  return options;
}

/**
 * Decide qué cámara usar:
 *  1. Si se acaba de conectar una cámara externa, se usa esa.
 *  2. Si la elegida por el usuario sigue disponible, se mantiene.
 *  3. Si no, la primera externa, luego la trasera (preferiblemente la automática), luego cualquiera.
 */
export function pickCamera(
  devices: CameraLike[],
  preferredId: string | null,
  previousIds: string[] = [],
): CameraLike | undefined {
  const newlyPlugged = devices.find(d => isExternal(d) && previousIds.length > 0 && !previousIds.includes(d.id));
  if (newlyPlugged) return newlyPlugged;

  const preferred = devices.find(d => d.id === preferredId);
  if (preferred) return preferred;

  return (
    devices.find(isExternal) ??
    devices.find(d => d.position === 'back' && d.isVirtualDevice) ??
    devices.find(d => d.position === 'back' && d.type === 'wide-angle') ??
    devices.find(d => d.position === 'back') ??
    devices[0]
  );
}
