import { generateClient } from 'aws-amplify/api';

const client = generateClient();

export interface PlateCheckResult {
  found: boolean;
  plate: string;
  id?: string | null;
  vehicleType?: string | null;
  brand?: string | null;
  line?: string | null;
  color?: string | null;
  modelYear?: string | null;
  reason?: string | null;
  priority?: string | null;
  notes?: string | null;
}

export type DetectionStatus = 'alerta' | 'en_gestion' | 'capturado' | 'falso_positivo';

/** Desde dónde se leyó la placa: celular de un operario o cámara fija (ej. parqueadero) */
export type SourceType = 'movil' | 'fija';

export interface SightingContext {
  sourceType: SourceType;
  sourceName?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
}

const CHECK_PLATE = /* GraphQL */ `
  query CheckPlate($plate: String!) {
    checkPlate(plate: $plate) {
      found plate id vehicleType brand line color modelYear reason priority notes
    }
  }
`;

const REPORT_SIGHTING = /* GraphQL */ `
  mutation ReportSighting(
    $plate: String!, $latitude: Float, $longitude: Float, $locationName: String,
    $sourceType: String, $sourceName: String, $rawText: String
  ) {
    reportSighting(
      plate: $plate, latitude: $latitude, longitude: $longitude, locationName: $locationName,
      sourceType: $sourceType, sourceName: $sourceName, rawText: $rawText
    ) {
      found plate id vehicleType brand line color modelYear reason priority notes
    }
  }
`;

const CREATE_DETECTION = /* GraphQL */ `
  mutation CreatePlateDetection($input: CreatePlateDetectionInput!) {
    createPlateDetection(input: $input) { id status }
  }
`;

const UPDATE_DETECTION = /* GraphQL */ `
  mutation UpdatePlateDetection($input: UpdatePlateDetectionInput!) {
    updatePlateDetection(input: $input) { id status }
  }
`;

async function run<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res: any = await client.graphql({ query, variables, authMode: 'userPool' });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data as T;
}

/** Consulta el endpoint `checkPlate` del backend Amplify (AppSync + Cognito). */
export async function checkPlate(plate: string): Promise<PlateCheckResult> {
  const data = await run<{ checkPlate: PlateCheckResult }>(CHECK_PLATE, { plate });
  return data.checkPlate;
}

/**
 * Verifica la placa contra el listado y la guarda en el historial de lecturas
 * (endpoint `reportSighting`), esté o no en el listado.
 */
export async function reportSighting(plate: string, rawText: string, ctx: SightingContext): Promise<PlateCheckResult> {
  const data = await run<{ reportSighting: PlateCheckResult }>(REPORT_SIGHTING, {
    plate,
    rawText,
    sourceType: ctx.sourceType,
    sourceName: ctx.sourceName,
    locationName: ctx.locationName,
    latitude: ctx.latitude,
    longitude: ctx.longitude,
  });
  return data.reportSighting;
}

export async function createDetection(input: {
  plate: string;
  rawText?: string;
  wantedPlateId?: string | null;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  sourceType?: SourceType;
  detectedBy?: string;
}): Promise<string | undefined> {
  const data = await run<{ createPlateDetection: { id: string } }>(CREATE_DETECTION, {
    input: { ...input, status: 'alerta', detectedAt: new Date().toISOString() },
  });
  return data.createPlateDetection?.id;
}

export async function updateDetectionStatus(id: string, status: DetectionStatus, notes?: string) {
  await run(UPDATE_DETECTION, { input: { id, status, ...(notes ? { notes } : {}) } });
}
