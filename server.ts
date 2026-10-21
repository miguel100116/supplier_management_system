import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { accountProvisioningClient, accountRequestErrorHandler, createAccountHandler } from './server/createAccount';
import { loadServerEnvironment, publicRuntimeConfig } from './server/environment';

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === 'production' || path.basename(process.argv[1] || '') === 'server.cjs';
  const env = loadServerEnvironment(isProduction ? 'production' : 'development');
  const app = express();
  const PORT = Number(env.PORT || 3000);

  app.post('/api/admin/accounts', express.json({ limit: '8kb' }),
    createAccountHandler(accountProvisioningClient(env)));
  app.use('/api/admin/accounts', accountRequestErrorHandler);

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
    res.json(publicRuntimeConfig(env));
  });

  if (isProduction) {
    // Serve static assets from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Fallback to index.html for React SPA client-side routing
    app.get('*', (req, res) => {
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
