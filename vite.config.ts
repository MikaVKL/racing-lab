import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Kurzer Commit-Hash als Build-Kennung (im HUD sichtbar); ohne Git: "dev"
const build = (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'dev'; }
})();

// base './' damit der Build auch unter GitHub Pages (Unterpfad) läuft
export default defineConfig({ base: './', define: { __BUILD__: JSON.stringify(build) } });
