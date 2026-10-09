import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Yagona .env monorepo ildizida turadi.
const envDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const webPort = Number(env.WEB_PORT ?? 5180);
  const apiTarget = `http://localhost:${env.API_PORT ?? 4100}`;

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // 0.0.0.0: kompyuterdan 127.0.0.1, telefonda esa Wi-Fi IP (masalan
      // 192.168.0.146) orqali ochiladi. Faqat IPv6 bo'lsa Windows rad etadi.
      host: true,
      port: webPort,
      strictPort: true,
      // Dev'da API bilan bir xil origin: refresh cookie (SameSite=Strict) muammosiz ishlaydi.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
    },
  };
});
