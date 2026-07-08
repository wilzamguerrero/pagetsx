import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This allows us to use process.env.VARIABLE_NAME in the client code
    // It will be replaced with the actual values during the build process
    'process.env.ROOT_PAGE_ID': JSON.stringify(process.env.ROOT_PAGE_ID),
    'process.env.NOTION_PORTFOLIO_KEY': JSON.stringify(process.env.NOTION_PORTFOLIO_KEY),
  },
  server: {
    // En desarrollo: `npm run dev` (Vite) + `npm run functions` (wrangler pages dev en :8788).
    // Vite reenvía las llamadas /api a las Cloudflare Pages Functions locales.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
  }
});
