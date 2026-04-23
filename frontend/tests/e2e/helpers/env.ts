import fs from 'fs';
import path from 'path';

// Load .env.playwright if it exists
const envFile = path.join(__dirname, '../../../.env.playwright');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && !process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
}

export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env var: ${key}. Create .env.playwright (see .env.playwright.example)`);
  return val;
}

export const TEST_EMAIL  = () => getEnv('TEST_EMAIL');
export const TEST_PASS   = () => getEnv('TEST_PASSWORD');
export const TENANT_SLUG = () => getEnv('TENANT_SLUG');
export const BASE        = 'http://localhost:3000';
