import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getProjectRoot(): string {
  return resolve(__dirname, '..', '..');
}

export function getAppDataDir(): string {
  return join(getProjectRoot(), '.ai-memory');
}
