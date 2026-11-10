import { loadEnv } from 'vite';
import { responseCacheConfigured } from './responseCache';

/** Load the same mode-specific files as Vite, keeping shell/deployment values authoritative. */
export function loadServerEnvironment(
  mode: string,
  root = process.cwd(),
  runtime: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return { ...loadEnv(mode, root, ['VITE_', 'SUPABASE_', 'UPSTASH_', 'PORT']), ...runtime };
}

/** Explicit allowlist: server credentials must never enter /api/config. */
export function publicRuntimeConfig(env: NodeJS.ProcessEnv) {
  return {
    supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
    supabasePublishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    azureClientId: env.VITE_AZURE_CLIENT_ID || '',
    azureTenantId: env.VITE_AZURE_TENANT_ID || '',
    azureRedirectUri: env.VITE_AZURE_REDIRECT_URI || '',
    deploymentEnvironment: env.VITE_DEPLOYMENT_ENV || '',
    responseCacheEnabled: responseCacheConfigured(env),
  };
}
