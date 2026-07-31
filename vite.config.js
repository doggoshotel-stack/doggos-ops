import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // Internal ops app (password-gated).
        main: resolve(__dirname, 'index.html'),
        // Public customer portal.
        portal: resolve(__dirname, 'portal.html'),
        // Public convivencia consent form.
        consentimiento: resolve(__dirname, 'consentimiento.html'),
      },
    },
  },
});
