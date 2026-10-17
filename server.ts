import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Simple API route example / health-check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Survey Analytics Prototype Express API is running'
    });
  });

  // Azure's client and tenant IDs are public SPA configuration. Returning
  // them at runtime lets deployments inject env values without rebuilding the
  // static frontend bundle.
  app.get('/api/config', (req, res) => {
    res.json({
      supabaseUrl: process.env.VITE_SUPABASE_URL || '',
      supabasePublishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      azureClientId: process.env.VITE_AZURE_CLIENT_ID || '',
      azureTenantId: process.env.VITE_AZURE_TENANT_ID || '',
      azureRedirectUri: process.env.VITE_AZURE_REDIRECT_URI || '',
      deploymentEnvironment: process.env.VITE_DEPLOYMENT_ENV || '',
    });
  });

  // Check if we are running in production
  const isProduction =
    process.env.NODE_ENV === 'production' || path.basename(process.argv[1] || '') === 'server.cjs';

  if (isProduction) {
    // Serve static assets from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Express 4 accepts the bare wildcard. Keep API misses as real 404s while
    // serving the SPA entry point for every browser-managed application path.
    app.get('*', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Integrate Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${isProduction ? 'production' : 'development'} mode`);
    console.log(`Access the application at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
