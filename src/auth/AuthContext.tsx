import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Hub } from 'aws-amplify/utils';
import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
} from 'aws-amplify/auth';

/** Roles que escanean con el celular en la calle */
export const MOBILE_GROUPS = ['operario', 'admin'];
/** Cuentas de dispositivos fijos (celular/cámara instalada en un parqueadero) */
export const FIXED_GROUPS = ['camara'];

export type ScanMode = 'movil' | 'fija';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'newPasswordRequired' }
  | { status: 'signedIn'; email: string; groups: string[] };

interface AuthContextValue {
  state: AuthState;
  canScan: boolean;
  /** 'movil' para operarios, 'fija' para cuentas de cámara fija */
  mode: ScanMode | null;
  signIn: (email: string, password: string) => Promise<void>;
  confirmNewPassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function translateAuthError(error: any): string {
  const name = error?.name || '';
  if (name === 'NotAuthorizedException') return 'Correo o contraseña incorrectos.';
  if (name === 'UserNotFoundException') return 'El usuario no existe. Solicítalo al administrador.';
  if (name === 'InvalidPasswordException') return 'La contraseña no cumple la política: mínimo 8 caracteres, mayúsculas, minúsculas, números y símbolos.';
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') return 'Demasiados intentos, espera unos minutos.';
  if (name === 'NetworkError' || /network/i.test(error?.message || '')) return 'Sin conexión a internet.';
  return error?.message || 'Ocurrió un error inesperado.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const loadSession = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();
      const payload: any = session.tokens?.idToken?.payload ?? {};
      setState({
        status: 'signedIn',
        email: user.signInDetails?.loginId || payload.email || user.username,
        groups: payload['cognito:groups'] ?? [],
      });
    } catch {
      setState({ status: 'signedOut' });
    }
  }, []);

  useEffect(() => {
    loadSession();
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedOut' || payload.event === 'tokenRefresh_failure') {
        setState({ status: 'signedOut' });
      }
    });
    return unsubscribe;
  }, [loadSession]);

  const handleStep = useCallback(async (step: string) => {
    if (step === 'DONE') return loadSession();
    if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      setState({ status: 'newPasswordRequired' });
      return;
    }
    throw new Error(`Paso de autenticación no soportado: ${step}. Contacta al administrador.`);
  }, [loadSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { nextStep } = await amplifySignIn({ username: email.trim().toLowerCase(), password });
    await handleStep(nextStep.signInStep);
  }, [handleStep]);

  const confirmNewPassword = useCallback(async (password: string) => {
    const { nextStep } = await confirmSignIn({ challengeResponse: password });
    await handleStep(nextStep.signInStep);
  }, [handleStep]);

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setState({ status: 'signedOut' });
  }, []);

  const groups = state.status === 'signedIn' ? state.groups : [];
  const mode: ScanMode | null = groups.some(g => MOBILE_GROUPS.includes(g))
    ? 'movil'
    : groups.some(g => FIXED_GROUPS.includes(g)) ? 'fija' : null;

  const value = useMemo<AuthContextValue>(() => ({
    state,
    canScan: mode !== null,
    mode,
    signIn,
    confirmNewPassword,
    signOut,
  }), [state, mode, signIn, confirmNewPassword, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
