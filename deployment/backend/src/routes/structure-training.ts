import { Router, Request, Response } from 'express';
import { callAI } from '../utils/ai';

export const structureTrainingRouter = Router();

structureTrainingRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { content, name } = req.body;

    const systemPrompt = `You are an expert at analyzing training documentation and converting it into structured, actionable instructions for a browser automation agent.

Your task is to:
1. Read the provided training content
2. Extract the key steps and actions described
3. Convert them into a structured list of instructions that an AI agent can follow

Return a JSON array of steps, where each step has:
- "title": A short action title (e.g., "Navigate to Dashboard")
- "description": Detailed instructions for this step
- "expected_outcome": What should happen after completing this step (optional)

Focus on:
- Clear, actionable steps
- Specific UI elements to interact with (buttons, links, fields)
- Order of operations
- Any conditions or decision points

Respond ONLY with a valid JSON array, no additional text.`;

    const aiResponse = await callAI(systemPrompt, `Training document: "${name}"\n\nContent:\n${content}`, 0.3);

    // Parse the JSON response
    let instructions;
    try {
      const cleanedResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      instructions = JSON.parse(cleanedResponse);
    } catch {
      console.error('Failed to parse AI response:', aiResponse);
      throw new Error('Invalid AI response format');
    }

    res.json({ instructions });
  } catch (error) {
    console.error('Error in structure-training:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
