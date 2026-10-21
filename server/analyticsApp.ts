import express from 'express';
import { analyticsHandler } from './analytics';
import { accountProvisioningClient } from './createAccount';

const app = express();
app.get('/api/analytics', analyticsHandler(accountProvisioningClient(process.env)));

export default app;
