import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: env.VITE_BACKEND_BASE_URL
        ? {
            '/api': {
              target: env.VITE_BACKEND_BASE_URL,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          }
        : undefined,
    },
    build: {
      target: 'esnext'
    }
  };
});
