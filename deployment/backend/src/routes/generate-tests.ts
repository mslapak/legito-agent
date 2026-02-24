import { Router, Request, Response } from 'express';
import { query } from '../db';
import { callAIWithTools } from '../utils/ai';

export const generateTestsRouter = Router();

const testCaseTool = {
  type: 'function',
  function: {
    name: 'generate_test_cases',
    description: 'Generate test cases for the web application',
    parameters: {
      type: 'object',
      properties: {
        testCases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              prompt: { type: 'string' },
              expectedResult: { type: 'string' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['title', 'prompt', 'expectedResult', 'priority'],
          },
        },
      },
      required: ['testCases'],
    },
  },
};

generateTestsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { action, description, documentation, baseUrl, testType, projectId, rawText } = req.body;
    const userId = req.userId!;

    // Parse tests from raw text
    if (action === 'parse_tests') {
      const systemPrompt = `You are an expert QA engineer who extracts structured test cases from unstructured text.
Extract ALL test cases and structure them properly with title, prompt, expectedResult, priority.`;

      const userPrompt = `Extract and structure all test cases from:\n${baseUrl ? `Application URL: ${baseUrl}\n` : ''}\n${rawText}`;

      const result = await callAIWithTools(systemPrompt, userPrompt, [testCaseTool],
        { type: 'function', function: { name: 'generate_test_cases' } });

      const testCases = (result as any)?.testCases || [];
      return res.json({ testCases });
    }

    // Fetch credentials if project provided
    let credentialsContext = '';
    if (projectId) {
      const { rows: credentials } = await query(
        'SELECT name, username, password, description FROM project_credentials WHERE project_id = $1 AND user_id = $2',
        [projectId, userId]
      );
      if (credentials.length > 0) {
        credentialsContext = '\n\nAVAILABLE LOGIN CREDENTIALS:\n';
        credentials.forEach((c, i) => {
          credentialsContext += `${i + 1}. ${c.name}${c.description ? ` (${c.description})` : ''}:\n   - Username: ${c.username}\n   - Password: ${c.password}\n`;
        });
        credentialsContext += '\nIMPORTANT: Use the EXACT credentials above.';
      }
    }

    const hasDoc = documentation?.trim().length > 0;
    const systemPrompt = hasDoc
      ? `You are an expert QA engineer. Analyze documentation and extract comprehensive test cases.`
      : `You are an expert QA engineer. Generate comprehensive test cases based on the description.`;

    const userPrompt = hasDoc
      ? `Analyze docs and generate ${testType || 'functional'} tests.\nURL: ${baseUrl || 'N/A'}\n${credentialsContext}\n\n=== DOCS ===\n${documentation}`
      : `Generate ${testType || 'functional'} tests.\nURL: ${baseUrl || 'N/A'}\nDescription: ${description}\n${credentialsContext}`;

    const result = await callAIWithTools(systemPrompt, userPrompt, [testCaseTool],
      { type: 'function', function: { name: 'generate_test_cases' } });

    const testCases = (result as any)?.testCases || [];
    res.json({ testCases });
  } catch (error) {
    console.error('Error in generate-tests:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
