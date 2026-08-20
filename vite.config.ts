/// <reference types="vitest/config" />
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves the developer's own save file at /__dev/sample.sav so the UI can be
 * driven without a file picker. `apply: 'serve'` keeps it out of every build, so
 * a real save can never be deployed by accident.
 */
function devSaveFixture(): Plugin {
  return {
    name: 'dev-save-fixture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.endsWith('/__dev/sample.sav')) return next();
        try {
          const bytes = await readFile(resolve(process.cwd(), 'steamcampaign01.sav'));
          res.setHeader('Content-Type', 'application/octet-stream');
          res.end(bytes);
        } catch {
          res.statusCode = 404;
          res.end('no local save');
        }
      });
    },
  };
}

// GitHub Pages project sites are served from /<repo>/.
// Override with BASE_PATH=/ for a custom domain.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/mewgenics_breeder/',
  plugins: [react(), devSaveFixture()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
