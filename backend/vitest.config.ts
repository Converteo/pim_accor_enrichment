import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC émet les métadonnées des décorateurs, nécessaires à l'injection de dépendances de NestJS
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'] },
});
