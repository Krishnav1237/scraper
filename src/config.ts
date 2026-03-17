import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.join(__dirname, '..');

// Helper for CSV
const csv = (defaultValue: string = '') => 
  z.string()
   .default(defaultValue)
   .transform(val => val ? val.split(',').map(s => s.trim()).filter(Boolean) : []);

// Helper for Boolean
const bool = (defaultValue: string) =>
  z.enum(['true', 'false'])
   .default(defaultValue as 'true' | 'false')
   .transform(val => val === 'true');

// Configuration Schema
const configSchema = z.object({
  // App identity
  appName: z.string().default('Social Monitor'),
  dbName: z.string().default('monitor.db'),

  // Search Settings
  searchTerms: csv(''),
  requiredTerms: csv(''),
  filterStrict: bool('false'),
  filterBalanced: bool('true'),
  monitorSubreddits: csv(''),

  // Backwards-compat aliases (mapped from env below)
  brandRequiredTerms: csv(''),
  brandStrict: bool('false'),
  brandBalanced: bool('true'),
  brandSubreddits: csv(''),
  
  // App Identifiers
  playstoreAppId: z.string().default(''),
  appstoreAppId: z.string().default(''),
  
  // Single Proxy (Legacy)
  proxy: z.object({
    host: z.string(),
    port: z.string(),
    username: z.string().optional(),
    password: z.string().optional(),
  }).optional().or(z.literal('').transform(() => undefined)),

  // Cron Schedules
  cron: z.object({
    reddit: z.string().default('0 */4 * * *'),
    playstore: z.string().default('0 */3 * * *'),
    appstore: z.string().default('0 */3 * * *'),
  }),
  
  // Server
  port: z.string().default('3000').transform(Number),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Paths
  paths: z.object({
    root: z.string().default(rootPath),
    data: z.string().default(path.join(rootPath, 'data')),
    logs: z.string().default(path.join(rootPath, 'logs')),
    cookies: z.string().default(path.join(rootPath, 'cookies')),
    views: z.string().default(path.join(rootPath, 'src', 'web', 'views')),
  }),
  
  // Google Sheets (Optional)
  google: z.object({
    enabled: bool('false'),
    serviceAccountJson: z.string().default('service-account.json').transform(val => 
      path.isAbsolute(val) ? val : path.join(rootPath, val)
    ),
    spreadsheetId: z.string().optional(),
  }),
  
  // Rate Limits
  rateLimits: z.object({
    reddit: z.number().default(4),
    playstore: z.number().default(12),
    appstore: z.number().default(12),
  }),

  // Browser Controls
  browser: z.object({
    headless: bool('true'),
    slowMo: z.string().default('0').transform(Number),
  }),
});

// Validate Environment
const rawConfig = {
  appName: process.env.APP_NAME,
  dbName: process.env.DB_NAME,

  searchTerms: process.env.SEARCH_TERMS,
  // Support both new and legacy env var names
  requiredTerms: process.env.REQUIRED_TERMS ?? process.env.BRAND_REQUIRED_TERMS,
  filterStrict: process.env.FILTER_STRICT ?? process.env.BRAND_STRICT,
  filterBalanced: process.env.FILTER_BALANCED ?? process.env.BRAND_BALANCED,
  monitorSubreddits: process.env.MONITOR_SUBREDDITS ?? process.env.BRAND_SUBREDDITS,

  brandRequiredTerms: process.env.BRAND_REQUIRED_TERMS,
  brandStrict: process.env.BRAND_STRICT,
  brandBalanced: process.env.BRAND_BALANCED,
  brandSubreddits: process.env.BRAND_SUBREDDITS,
  
  playstoreAppId: process.env.PLAYSTORE_APP_ID,
  appstoreAppId: process.env.APPSTORE_APP_ID,
  
  proxy: process.env.PROXY_HOST ? {
    host: process.env.PROXY_HOST,
    port: process.env.PROXY_PORT,
    username: process.env.PROXY_USERNAME,
    password: process.env.PROXY_PASSWORD,
  } : undefined,
  
  cron: {
    reddit: process.env.REDDIT_CRON,
    playstore: process.env.PLAYSTORE_CRON,
    appstore: process.env.APPSTORE_CRON,
  },
  
  port: process.env.PORT,
  logLevel: process.env.LOG_LEVEL,
  
  paths: {}, // Pass empty object to trigger defaults
  
  google: {
    enabled: process.env.GOOGLE_SHEETS_ENABLED,
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  },
  
  rateLimits: {}, // Pass empty object to trigger defaults
  
  browser: {
    headless: process.env.HEADLESS,
    slowMo: process.env.SLOWMO,
  },
};

// Transform Proxy Object for App Consumption
const parsed = configSchema.safeParse(rawConfig);

if (!parsed.success) {
  console.error('❌ Invalid Configuration:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

const validated = parsed.data;

export const config = {
  ...validated,
  // Resolve effective filter settings: new names take precedence over legacy
  requiredTerms: validated.requiredTerms.length > 0 ? validated.requiredTerms : validated.brandRequiredTerms,
  filterStrict: validated.filterStrict || validated.brandStrict,
  filterBalanced: validated.filterBalanced || validated.brandBalanced,
  monitorSubreddits: validated.monitorSubreddits.length > 0 ? validated.monitorSubreddits : validated.brandSubreddits,
  proxy: validated.proxy ? {
    server: `http://${validated.proxy.host}:${validated.proxy.port}`,
    username: validated.proxy.username,
    password: validated.proxy.password,
  } : undefined,
};
