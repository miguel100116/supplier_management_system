/// <reference types="vite/client" />

interface Window {
  __SMS_RUNTIME_CONFIG__?: {
    supabaseUrl?: string;
    supabasePublishableKey?: string;
    azureClientId?: string;
    azureTenantId?: string;
    azureRedirectUri?: string;
    deploymentEnvironment?: string;
    responseCacheEnabled?: boolean;
  };
}
