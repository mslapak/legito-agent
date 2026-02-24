import express from 'express';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import { browserUseRouter } from './routes/browser-use';
import { generateTestsRouter } from './routes/generate-tests';
import { fetchDocumentationRouter } from './routes/fetch-documentation';
import { runTestsBatchRouter } from './routes/run-tests-batch';
import { structureTrainingRouter } from './routes/structure-training';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: '50mb' }));

// Health check (no auth)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected API routes
app.use('/api/browser-use', authMiddleware, browserUseRouter);
app.use('/api/generate-tests', authMiddleware, generateTestsRouter);
app.use('/api/fetch-documentation', authMiddleware, fetchDocumentationRouter);
app.use('/api/run-tests-batch', authMiddleware, runTestsBatchRouter);
app.use('/api/structure-training', authMiddleware, structureTrainingRouter);

// Internal route for batch self-invoke (uses service key, not Azure AD)
app.use('/api/internal/run-tests-batch', runTestsBatchRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Legito Agent Backend running on port ${PORT}`);
});
