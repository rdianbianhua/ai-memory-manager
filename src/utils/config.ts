import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import YAML from 'yaml';
import { getAppDataDir } from './paths.js';

const APP_DATA_DIR = getAppDataDir();

export interface Config {
  database: {
    path: string;
  };
  embedder: {
    provider: 'openai' | 'local';
    model: string;
    dimension: number;
    apiKeyEnv: string;
  };
  mcp: {
    enabled: boolean;
    port: number;
    host: string;
  };
  defaults: {
    projectMemoryImportance: number;
    globalMemoryImportance: number;
    maxSearchResults: number;
  };
}

const DEFAULT_CONFIG: Config = {
  database: {
    path: join(APP_DATA_DIR, 'data'),
  },
  embedder: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimension: 1536,
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  mcp: {
    enabled: true,
    port: 3100,
    host: 'localhost',
  },
  defaults: {
    projectMemoryImportance: 3,
    globalMemoryImportance: 3,
    maxSearchResults: 10,
  },
};

export function getConfigPath(): string {
  return join(APP_DATA_DIR, 'config.yaml');
}

export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    const configDir = dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const userConfig = YAML.parse(content);
    return { ...DEFAULT_CONFIG, ...userConfig };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = YAML.stringify(config);
  writeFileSync(configPath, content, 'utf-8');
}

export function updateConfig(updates: Partial<Config>): Config {
  const config = loadConfig();
  const merged = deepMerge(config as unknown as Record<string, unknown>, updates as Partial<Record<string, unknown>>) as unknown as Config;
  saveConfig(merged);
  return merged;
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target } as T;
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
    } else if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }
  return result;
}

let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}
