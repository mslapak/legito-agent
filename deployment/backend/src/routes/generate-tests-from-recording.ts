import { Router } from 'express';
import { callAIWithTools } from '../utils/ai';

export const generateTestsFromRecordingRouter = Router();

const testCaseTool = {
  type: 'function' as const,
  function: {
    name: 'generate_test_cases',
    description: 'Generate structured test cases from recorded steps',
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
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['title', 'prompt', 'expectedResult', 'priority'],
          },
        },
      },
      required: ['testCases'],
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

    const systemPrompt = `You are a QA test case generator. You analyze recorded user interaction steps from a browser session and generate structured test cases for Azure DevOps.

Rules:
- Group related sequential steps into logical test cases
- Each test case should be independently executable
- Write clear, actionable prompts for browser automation
- Include expected results based on observations
- Assign priority: high for critical flows, medium for standard, low for minor
- Generate 3-15 test cases depending on session complexity`;

    const userPrompt = `Analyze these recorded browser interaction steps and generate test cases:

${base_url ? `Base URL: ${base_url}` : ''}
${session_title ? `Session: ${session_title}` : ''}

RECORDED STEPS:
${stepsText}

Generate structured test cases from these interactions.`;

    const result = await callAIWithTools(
      systemPrompt,
      userPrompt,
      [testCaseTool],
      'generate_test_cases'
    );

    const testCases = result?.testCases || [];
    res.json({ testCases });
  } catch (error: any) {
    console.error('Generate tests from recording error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
