# Logcolombia Placas (app móvil)

App Android / iOS para **moderadores** de Logcolombia: usa la cámara para leer en tiempo real
las placas de los vehículos, las valida contra el listado de **placas buscadas** que se administra
en el panel web y, si una placa está en el listado, **alerta de inmediato** (pantalla roja, sirena y
vibración) para iniciar la gestión de captura del vehículo.

- No hay registro: los usuarios se crean en Cognito (el mismo backend Amplify del panel web
  [`logcolombiasas/logcolombia`](https://github.com/logcolombiasas/logcolombia), que es solo la parte administrativa).
- Solo los usuarios del grupo **`moderador`** (o `admin`) pueden usar el escáner.

## Stack

| Pieza | Tecnología |
|---|---|
| App multiplataforma | React Native + **Expo** (SDK 57) con *development builds* / EAS |
| Cámara en tiempo real | `react-native-vision-camera` v5 (frame processors) |
| OCR en el dispositivo | Google ML Kit vía `react-native-vision-camera-ocr-plus` (sin internet, sin costo por lectura) |
| Autenticación | Amplify JS v6 + Cognito (grupos `moderador` / `admin`) |
| Endpoint de validación | Query GraphQL `checkPlate` en AppSync (backend Amplify del panel web) |
| Registro de alertas | Modelo `PlateDetection` (el panel web lo recibe en tiempo real) |

### ¿Por qué React Native (Expo) y no Flutter / nativo?

- El equipo ya trabaja en TypeScript (Angular) y con **Amplify JS**: se reutiliza el mismo lenguaje,
  la misma librería de autenticación y el mismo backend.
- Un solo código para Android e iOS, con builds en la nube (EAS) sin necesitar Xcode ni Android Studio.
- El OCR corre **en el dispositivo** con ML Kit dentro de un frame processor nativo, así que el
  rendimiento en tiempo real es equivalente al de una app nativa.

## Cómo funciona el reconocimiento

1. VisionCamera entrega frames; ML Kit reconoce el texto de 1 de cada 5 frames (~6 lecturas/s).
2. `src/plates/plateParser.ts` extrae candidatas con los formatos colombianos
   `ABC123` (carro), `ABC12D` (moto) y `ABC12` (moto antigua), corrigiendo confusiones típicas del
   OCR según la posición (O↔0, I↔1, B↔8, S↔5…) y descartando texto como "BOGOTÁ D.C.".
3. `src/plates/PlateTracker.ts` exige que la misma placa se lea **2 veces en 2,5 s** antes de
   consultarla (evita lecturas falsas) y luego la deja en espera 60 s.
4. Se consulta `checkPlate`. Las placas que **no** están se recuerdan 2 min para no repetir consultas.
5. Si la placa está en el listado: alerta a pantalla completa, sirena y vibración, y se crea un
   `PlateDetection` con la ubicación GPS y el correo del moderador. El moderador marca
   **"Iniciar gestión de captura"** (`en_gestion`) o **"Falso positivo"**.

También se puede **digitar la placa** manualmente (placas sucias, de noche, etc.) y encender la linterna.

## Requisitos

- Node 22+
- Backend del panel web desplegado con el módulo de placas (modelos `WantedPlate`, `PlateDetection`,
  query `checkPlate` y grupo `moderador`).
- Cuenta de [Expo](https://expo.dev) para compilar con EAS.

## Configuración

```bash
npm install

# Genera amplify_outputs.json apuntando al backend de Amplify (necesita credenciales AWS)
AMPLIFY_APP_ID=<id de la app en Amplify> AMPLIFY_BRANCH=main npm run amplify:outputs
```

> También puedes copiar el `amplify_outputs.json` del repositorio administrativo (`logcolombiasas/logcolombia`)
> después de desplegar el backend. Ver `amplify_outputs.example.json` como referencia.

## Desarrollo

La app usa módulos nativos (cámara/ML Kit), por lo que **no funciona en Expo Go**; se necesita un
*development build*:

```bash
# Android: dispositivo conectado por USB o emulador (requiere Android Studio)
npm run android
# iOS: requiere Mac + Xcode y un iPhone físico (ML Kit no corre en el simulador arm64)
npm run ios

# o compilar el development build en la nube e instalarlo en el teléfono
npx eas-cli@latest build --profile development --platform android
npx expo start
```

## Generar el APK / app de iOS

```bash
npx eas-cli@latest login
npx eas-cli@latest init          # solo la primera vez: vincula el proyecto a tu cuenta Expo
npm run build:apk                # APK instalable (perfil "preview")
npm run build:ios                # build para TestFlight / App Store (perfil "production")
```

> `amplify_outputs.json` está en `.gitignore`. Para EAS súbelo como *file secret* o quítalo del
> `.gitignore` en una rama privada antes de compilar.

## Crear usuarios moderadores

En la consola de AWS → Cognito → User pool del proyecto:

1. *Create user* con el correo del moderador y una contraseña temporal.
2. Agregarlo al grupo **`moderador`**.
3. En el primer ingreso la app le pedirá definir una contraseña nueva.

O con AWS CLI:

```bash
aws cognito-idp admin-create-user --user-pool-id <POOL_ID> --username correo@dominio.com \
  --user-attributes Name=email,Value=correo@dominio.com Name=email_verified,Value=true
aws cognito-idp admin-add-user-to-group --user-pool-id <POOL_ID> --username correo@dominio.com --group-name moderador
```

## Scripts

| Script | Descripción |
|---|---|
| `npm start` | Servidor de desarrollo (Metro) |
| `npm run android` / `npm run ios` | Compila e instala el development build local |
| `npm test` | Pruebas del lector de placas |
| `npm run typecheck` | Verificación de tipos |
| `npm run build:apk` | APK con EAS |
| `npm run build:ios` | Build de iOS con EAS |

## Estructura

```
App.tsx                      Raíz: login → sin permisos → escáner
src/config/amplify.ts        Configuración de Amplify
src/auth/AuthContext.tsx     Sesión Cognito, grupos y cambio de contraseña inicial
src/api/plates.ts            checkPlate / createPlateDetection / updatePlateDetection
src/plates/plateParser.ts    Extracción y corrección de placas colombianas
src/plates/PlateTracker.ts   Confirmación por lecturas repetidas y cooldown
src/plates/usePlateScanner.ts Orquesta OCR → confirmación → consulta → alerta
src/screens/ScannerScreen.tsx Cámara + OCR en tiempo real
src/components/WantedAlert.tsx Alerta de vehículo buscado
```
