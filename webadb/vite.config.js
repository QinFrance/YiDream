import { defineConfig } from 'vite';

// base relative : fonctionne sur https://<user>.github.io/<repo>/ comme sur un domaine perso.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist' },
});
