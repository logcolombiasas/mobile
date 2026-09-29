# Logcolombia Placas (app móvil)

App Android / iOS para **operarios** de Logcolombia: usa la cámara para leer en tiempo real
las placas de los vehículos, las valida contra el listado de **placas buscadas** que se administra
en el panel web y, si una placa está en el listado, **alerta de inmediato** (pantalla roja, sirena y
vibración) para iniciar la gestión de captura del vehículo.

- No hay registro: los usuarios se crean en Cognito (el mismo backend Amplify del panel web
  [`logcolombiasas/logcolombia`](https://github.com/logcolombiasas/logcolombia), que es solo la parte administrativa).
- Dos modos según el grupo del usuario:
  - **`operario`** (o `admin`): escanea con el celular en la calle; alerta a pantalla completa.
  - **`camara`**: **cámara fija** (ej. un celular instalado en un parqueadero). Escanea de forma
    continua, registra cada detección con el nombre del lugar y el administrador recibe la
    notificación en el panel web sin que nadie tenga que operar el dispositivo.
- **Todas** las placas leídas quedan en un historial (estén o no en el listado), para saber dónde se
  ha visto un vehículo antes de que su placa entre al listado. Se consulta en el panel web en
  *Placas → Historial de placas*.

## Stack

| Pieza | Tecnología |
|---|---|
| App multiplataforma | React Native + **Expo** (SDK 57) con *development builds* / EAS |
| Cámara en tiempo real | `react-native-vision-camera` v5 (frame processors) |
| OCR en el dispositivo | Google ML Kit vía `react-native-vision-camera-ocr-plus` (sin internet, sin costo por lectura) |
| Autenticación | Amplify JS v6 + Cognito (grupos `operario` / `admin` / `camara`) |
| Endpoint de validación | Mutation GraphQL `reportSighting` en AppSync: verifica la placa y la guarda en el historial |
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
   consultarla (evita lecturas falsas) y luego la deja en espera (60 s con celular, 10 min en
   cámara fija, para no repetir el mismo carro estacionado).
4. Se llama a `reportSighting` con la ubicación (GPS del celular o lugar de la cámara fija): el
   backend responde si está en el listado y guarda la lectura en el historial.
5. Si la placa está en el listado:
   - **Operario**: alerta a pantalla completa, sirena y vibración, y se crea un `PlateDetection`
     con la ubicación. El operario marca **"Iniciar gestión de captura"** o **"Falso positivo"**.
   - **Cámara fija**: suena una alerta corta, se crea el `PlateDetection` con el nombre del lugar
     y la cámara sigue escaneando. El administrador recibe la notificación en el panel web.

También se puede **digitar la placa** manualmente (placas sucias, de noche, etc.) y encender la linterna.

## Cámaras compatibles

Con el botón 📷 se elige la cámara. La elección se recuerda entre sesiones.

| Cámara | Android | iPhone |
|---|---|---|
| Cámaras del celular (principal, gran angular, teleobjetivo, frontal) | ✅ | ✅ |
| Webcam USB (UVC) | ✅ si el celular soporta cámaras externas* | ❌ (iOS no lo permite en iPhone) |
| Cualquier cámara con salida HDMI (GoPro, cámara de tablero, videocámara) + capturadora HDMI→USB | ✅* | ❌ |
| GoPro en modo webcam por USB | ✅* si el modelo funciona como webcam UVC estándar | ❌ |

\* Android expone cámaras USB externas en muchos celulares recientes (Android 10+, con USB-C OTG),
pero depende del fabricante. Para comprobarlo, conecta la cámara: si aparece en la lista como
"🔌 Externa", funciona. Al conectarla la app cambia a ella automáticamente, y si se desconecta
vuelve a la cámara del celular.

## Modo cámara fija (parqueaderos)

1. Crear en Cognito un usuario por dispositivo (ej. `camara.calle80@logcolombia.com`) y agregarlo
   al grupo **`camara`**.
2. Iniciar sesión con ese usuario en el celular que quedará fijo.
3. La primera vez la app pide el **nombre del lugar** (ej. "Parqueadero Calle 80 - Entrada") y
   toma la ubicación GPS. Se puede cambiar con el botón ⚙️.
4. Recomendado: celular conectado al cargador, en un soporte fijo apuntando a la entrada/salida,
   con WiFi o datos, y con **fijación de pantalla** de Android activada (Ajustes → Seguridad →
   Fijar app) para que la app no se cierre. Se puede usar una cámara USB o HDMI (ver abajo) para
   mejor alcance.

## Requisitos

- Node 22+
- Backend del panel web desplegado con el módulo de placas (modelos `WantedPlate`, `PlateDetection`,
  `PlateSighting`, mutation `reportSighting` y grupos `operario` / `camara`).
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

> `amplify_outputs.json` no se sube a git (`.gitignore`), pero sí se envía a EAS al compilar
> gracias a `.easignore`. Basta con que exista en la carpeta del proyecto antes de `npm run build:apk`.

## Usuarios operarios y cámaras

En la consola de AWS → Cognito → User pool del proyecto:

1. *Create user* con el correo del operario y una contraseña temporal.
2. Agregarlo al grupo **`operario`** (o **`camara`** para un dispositivo fijo).
3. En el primer ingreso la app le pedirá definir una contraseña nueva.

O con AWS CLI:

```bash
aws cognito-idp admin-create-user --user-pool-id <POOL_ID> --username correo@dominio.com \
  --user-attributes Name=email,Value=correo@dominio.com Name=email_verified,Value=true
aws cognito-idp admin-add-user-to-group --user-pool-id <POOL_ID> --username correo@dominio.com --group-name operario
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
src/api/plates.ts            reportSighting / createPlateDetection / updatePlateDetection
src/plates/plateParser.ts    Extracción y corrección de placas colombianas
src/plates/PlateTracker.ts   Confirmación por lecturas repetidas y cooldown
src/plates/usePlateScanner.ts Orquesta OCR → confirmación → consulta → alerta
src/screens/ScannerScreen.tsx Cámara + OCR en tiempo real
src/camera/                  Selección de cámara (celular / USB externa)
src/fixed/                   Lugar configurado para el modo cámara fija
src/location/                Ubicación GPS del celular
src/components/FixedSiteSetup.tsx Configuración de la cámara fija
src/components/WantedAlert.tsx Alerta de vehículo buscado
```
