import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig, loadEnv, type Plugin} from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = path.resolve(configDir, 'src/version.ts');

/** After each production build, persist APP_VERSION + 0.1 for the next rebuild. */
function bumpAppVersionPlugin(): Plugin {
  let bumped = false;
  return {
    name: 'bump-app-version',
    apply: 'build',
    closeBundle() {
      if (bumped) return;
      if (process.env.GRIDCITY_SKIP_VERSION_BUMP === '1') return;
      if (!fs.existsSync(VERSION_FILE)) return;
      const src = fs.readFileSync(VERSION_FILE, 'utf8');
      const match = src.match(/export const APP_VERSION = '([\d.]+)'/);
      if (!match) return;
      const current = Number(match[1]);
      if (!Number.isFinite(current)) return;
      const next = (Math.round((current + 0.1) * 10) / 10).toFixed(1);
      fs.writeFileSync(VERSION_FILE, src.replace(match[0], `export const APP_VERSION = '${next}'`));
      bumped = true;
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), bumpAppVersionPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
