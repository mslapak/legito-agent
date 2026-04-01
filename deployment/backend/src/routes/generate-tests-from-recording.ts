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

    const systemPrompt = `You are a QA test case generator. You analyze recorded browser session steps and produce ONE detailed structured test case.

Rules:
- Generate exactly ONE test case covering the entire recorded session
- SKIP idle steps: Do NOT include "Wait for X seconds", "No action detected", or any step where the user did nothing
- EXTRACT REAL USER ACTIONS: Focus on clicks, navigation, typing, selections, form submissions
- Look at the Action, Result, and URL fields to identify real interactions
- Each step must be a specific, actionable instruction
- For EVERY step provide a corresponding expected result
- The number of steps MUST equal the number of expected results (1:1 mapping)
- Assign priority: high for critical flows, medium for standard, low for minor
- Be specific: use exact URLs, button labels, field names from the recording`;

    const userPrompt = `Analyze these recorded browser interaction steps. Extract ONLY real user actions (clicks, typing, navigation) and ignore idle/wait steps. Generate ONE detailed test case:

${base_url ? `Base URL: ${base_url}` : ''}
${session_title ? `Session: ${session_title}` : ''}

RECORDED STEPS:
${stepsText}

IMPORTANT: Do NOT create steps like "Wait for 5 seconds". Extract only genuine user interactions.`;

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
