import express from 'express';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import { browserUseRouter } from './routes/browser-use';
import { generateTestsRouter } from './routes/generate-tests';
import { fetchDocumentationRouter } from './routes/fetch-documentation';
import { runTestsBatchRouter } from './routes/run-tests-batch';
import { structureTrainingRouter } from './routes/structure-training';
import { evaluateTestRouter } from './routes/evaluate-test';

// CRUD routers
import { profilesRouter } from './routes/crud/profiles';
import { projectsRouter } from './routes/crud/projects';
import { projectCredentialsRouter } from './routes/crud/project-credentials';
import { testSuitesRouter } from './routes/crud/test-suites';
import { tasksRouter } from './routes/crud/tasks';
import { generatedTestsRouter as generatedTestsCrudRouter } from './routes/crud/generated-tests';
import { testCasesRouter } from './routes/crud/test-cases';
import { testBatchRunsRouter } from './routes/crud/test-batch-runs';
import { documentationVerificationsRouter } from './routes/crud/documentation-verifications';
import { verificationStepsRouter } from './routes/crud/verification-steps';
import { operationTemplatesRouter as operationTemplatesCrudRouter } from './routes/crud/operation-templates';
import { operationTrainingsRouter } from './routes/crud/operation-trainings';

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

// Protected function routes
app.use('/api/browser-use', authMiddleware, browserUseRouter);
app.use('/api/generate-tests', authMiddleware, generateTestsRouter);
app.use('/api/fetch-documentation', authMiddleware, fetchDocumentationRouter);
app.use('/api/run-tests-batch', authMiddleware, runTestsBatchRouter);
app.use('/api/structure-training', authMiddleware, structureTrainingRouter);

// Protected CRUD routes
app.use('/api/profiles', authMiddleware, profilesRouter);
app.use('/api/projects', authMiddleware, projectsRouter);
app.use('/api/project-credentials', authMiddleware, projectCredentialsRouter);
app.use('/api/test-suites', authMiddleware, testSuitesRouter);
app.use('/api/tasks', authMiddleware, tasksRouter);
app.use('/api/generated-tests', authMiddleware, generatedTestsCrudRouter);
app.use('/api/test-cases', authMiddleware, testCasesRouter);
app.use('/api/test-batch-runs', authMiddleware, testBatchRunsRouter);
app.use('/api/documentation-verifications', authMiddleware, documentationVerificationsRouter);
app.use('/api/verification-steps', authMiddleware, verificationStepsRouter);
app.use('/api/operation-templates', authMiddleware, operationTemplatesCrudRouter);
app.use('/api/operation-trainings', authMiddleware, operationTrainingsRouter);

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
