import express from 'express';
import { analyticsHandler } from '../server/analytics';
import { accountProvisioningClient } from '../server/createAccount';

// Vercel serves root api/ entries independently of the static Vite build.
// Reuse the Express authorization and aggregate boundary without starting a listener.
const app = express();
app.get('/api/analytics', analyticsHandler(accountProvisioningClient(process.env)));

export default app;
