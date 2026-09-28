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

const CHECK_PLATE = /* GraphQL */ `
  query CheckPlate($plate: String!) {
    checkPlate(plate: $plate) {
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

export async function createDetection(input: {
  plate: string;
  rawText?: string;
  wantedPlateId?: string | null;
  latitude?: number;
  longitude?: number;
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
