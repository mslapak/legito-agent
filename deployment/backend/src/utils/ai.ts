/**
 * Azure OpenAI helper
 * Replaces Lovable AI Gateway calls
 */

export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.7,
  tools?: unknown[],
  toolChoice?: unknown
): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

  if (!endpoint || !apiKey) {
    throw new Error('Azure OpenAI not configured (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY)');
  }

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const body: Record<string, unknown> = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  };

  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Azure OpenAI error:', response.status, errorText);
    throw new Error(`Azure OpenAI error: ${response.status}`);
  }

  const data = await response.json();

  // Handle tool calls
  if (data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
    return data.choices[0].message.tool_calls[0].function.arguments;
  }

  return data.choices?.[0]?.message?.content || '';
}

/**
 * Call AI with tool definitions and return parsed result
 */
export async function callAIWithTools(
  systemPrompt: string,
  userPrompt: string,
  tools: unknown[],
  toolChoice: unknown,
  temperature = 0.7
): Promise<unknown> {
  const raw = await callAI(systemPrompt, userPrompt, temperature, tools, toolChoice);
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
