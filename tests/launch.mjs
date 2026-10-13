// Gemeinsamer Browser-Start für alle Tests (Headless-Chromium mit Software-WebGL)
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function launchBrowser(extraArgs = []) {
  // CHROMIUM_PATH hat Vorrang; sonst der vorinstallierte Browser der Cloud-Umgebung;
  // sonst der von `npx playwright install` (z. B. in der CI)
  const executablePath = process.env.CHROMIUM_PATH || (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
  return chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...extraArgs],
  });
}
