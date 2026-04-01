import { Router } from 'express';
import { callAIWithTools } from '../utils/ai';

export const generateTestsFromRecordingRouter = Router();

const testCaseTool = {
  type: 'function' as const,
  function: {
    name: 'generate_test_case',
    description: 'Generate a single detailed test case from recorded steps with 1:1 step-to-expected mapping',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Descriptive test case title based on the session' },
        steps: {
          type: 'array',
          description: 'Ordered list of test steps, one per recorded interaction',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'Specific actionable instruction' },
              expected: { type: 'string', description: 'Expected result after performing this action' },
            },
            required: ['action', 'expected'],
          },
        },
        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
      required: ['title', 'steps', 'priority'],
    },
  },
};

generateTestsFromRecordingRouter.post('/', async (req, res) => {
  try {
    const { recorded_steps, project_id, base_url, session_title } = req.body;

    if (!recorded_steps || !Array.isArray(recorded_steps) || recorded_steps.length === 0) {
      return res.status(400).json({ error: 'No recorded steps provided' });
    }

    const stepsText = recorded_steps.map((step: any, i: number) => {
      const parts = [`Step ${i + 1}:`];
      if (step.url) parts.push(`  URL: ${step.url}`);
      if (step.next_goal) parts.push(`  Action: ${step.next_goal}`);
      if (step.evaluation_previous_goal) parts.push(`  Result: ${step.evaluation_previous_goal}`);
      return parts.join('\n');
    }).join('\n\n');

    const systemPrompt = `You are a QA test case generator. You analyze recorded user interaction steps from a browser session and generate ONE detailed structured test case.

Rules:
- Generate exactly ONE test case that covers the entire recorded session
- Each recorded step must become a specific, actionable instruction (e.g. "Click on the Email field and enter testuser@example.com")
- For EVERY step provide a corresponding expected result describing what should happen
- The number of steps MUST equal the number of expected results (1:1 mapping)
- Assign priority: high for critical flows, medium for standard, low for minor
- Be specific: use exact URLs, button labels, field names from the recording`;

    const userPrompt = `Analyze these recorded browser interaction steps and generate ONE detailed test case:

${base_url ? `Base URL: ${base_url}` : ''}
${session_title ? `Session: ${session_title}` : ''}

RECORDED STEPS:
${stepsText}

Generate a single detailed test case with step-by-step instructions and expected results for each step.`;

    const result = await callAIWithTools(
      systemPrompt,
      userPrompt,
      [testCaseTool],
      'generate_test_case'
    );

    let testCases: any[] = [];
    const parsed = result as any;
    if (parsed?.steps && Array.isArray(parsed.steps)) {
      const prompt = parsed.steps.map((s: any, i: number) => `${i + 1}. ${s.action}`).join('\n');
      const expectedResult = parsed.steps.map((s: any, i: number) => `${i + 1}. ${s.expected}`).join('\n');
      testCases = [{
        title: parsed.title || session_title || 'Recorded test case',
        prompt,
        expectedResult,
        priority: parsed.priority || 'medium',
      }];
    }

    res.json({ testCases });
  } catch (error: any) {
    console.error('Generate tests from recording error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
