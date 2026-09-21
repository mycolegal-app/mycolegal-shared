// #3 (Lamarca, 21-sep-2026) — «estar como app, en appstore». Decisión: sin app
// nativa; la vía es la web INSTALABLE (PWA): manifest + metas de Apple para que
// «Añadir a pantalla de inicio» en iOS/Android dé icono, nombre y pantalla completa.
//
// Cada app declara su manifest en `src/app/manifest.ts` con `buildManifest(...)` y
// añade `pwaMetadata(...)` a su `metadata` de `layout.tsx`. Los iconos son PNG
// (Safari ignora SVG en apple-touch-icon): `public/icons/icon-{192,512}.png` y
// `apple-touch-icon.png` (180). Ojo con el proxy de sesión: `/manifest.webmanifest`
// y `/icons/` deben quedar fuera del `matcher` o el móvil recibe el login.

export interface PwaAppInfo {
  /** Nombre completo (pantalla de instalación). */
  name: string;
  /** Nombre corto bajo el icono (≤ 12 caracteres). */
  shortName: string;
  description?: string;
  /** Color del tema (barra del navegador). Por defecto el dorado de la marca. */
  themeColor?: string;
  backgroundColor?: string;
  /** Ruta de arranque tras instalar. */
  startUrl?: string;
}

const BRAND_GOLD = '#B8953F';

/** Objeto para `export default function manifest()` en `src/app/manifest.ts`. */
export function buildManifest(app: PwaAppInfo) {
  return {
    name: app.name,
    short_name: app.shortName,
    description: app.description ?? app.name,
    start_url: app.startUrl ?? '/',
    display: 'standalone' as const,
    background_color: app.backgroundColor ?? '#ffffff',
    theme_color: app.themeColor ?? BRAND_GOLD,
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
    ],
  };
}

/** Fragmento de `Metadata` (Next) para el `layout.tsx` raíz de la app. */
export function pwaMetadata(app: PwaAppInfo) {
  return {
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default' as const,
      title: app.shortName,
    },
    icons: {
      icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  };
}
