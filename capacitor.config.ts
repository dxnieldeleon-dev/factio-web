import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mx.factio.app',
  appName: 'Factio',
  webDir: 'dist',
  // La app nativa carga el sitio desplegado en vivo en vez de un build
  // estático embebido — factio-web es una app TanStack Start con SSR
  // (Nitro + Cloudflare), no exporta a HTML/JS estático.
  server: {
    url: 'https://factio.lovable.app',
    cleartext: false
  }
};

export default config;
