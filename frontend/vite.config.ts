import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // .env i .env.local leżą w katalogu głównym repo — wspólne dla backendu i frontu
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  // Dokąd dev-serwer przekazuje /api i /socket.io. W docker compose to inny kontener
  // (API_PROXY_TARGET=http://api:7200), a przeglądarka rozmawia wyłącznie z Vite.
  const apiTarget = env.API_PROXY_TARGET || env.VITE_API_URL || 'http://localhost:7200';

  return {
    plugins: [vue()],
    envDir: fileURLToPath(new URL('..', import.meta.url)),
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('./src', import.meta.url)),
        // Źródła zamiast builda: jedna zmiana typu i front od razu ją widzi
        '@cue/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: Number(env.WEB_PORT ?? 7201),
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
      },
    },
    build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
  };
});
