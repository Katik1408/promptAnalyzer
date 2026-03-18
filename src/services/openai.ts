import OpenAI from 'openai';
import { get_encoding } from 'tiktoken';

let openaiClient: OpenAI | null = null;

// Cached encoder instance (reuse to avoid memory leaks)
let cachedEncoder: ReturnType<typeof get_encoding> | null = null;

// Optimized system message (~100 tokens vs ~250 tokens = 60% savings)
// OpenAI auto-caches identical prefixes for additional savings
const OPTIMIZATION_SYSTEM_MESSAGE = `Optimize prompts: remove filler words (please, can you, basically, actually, just, really), make direct, preserve technical details and code, keep original intent. Return ONLY the optimized prompt, no explanations or formatting.`;

// Token limits by tier
export const TOKEN_LIMITS = {
  free: {
    maxOutputTokens: 500,
    maxInputTokens: 1000,
    dailyLimit: 5,
  },
  pro: {
    maxOutputTokens: 2000,
    maxInputTokens: 4000,
    dailyLimit: Infinity,
  },
};

export type UserTier = 'free' | 'pro';

export function initOpenAI(apiKey: string): void {
  openaiClient = new OpenAI({ apiKey });
}

export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized. Call initOpenAI first.');
  }
  return openaiClient;
}

export function countTokens(text: string): number {
  try {
    // Use o200k_base encoding for gpt-4o-mini (same tokenizer as gpt-4o)
    if (!cachedEncoder) {
      cachedEncoder = get_encoding('o200k_base');
    }
    const tokens = cachedEncoder.encode(text);
    return tokens.length;
  } catch {
    // Fallback: rough estimate (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }
}

export async function optimizePrompt(
  originalPrompt: string,
  systemContext?: string,
  tier: UserTier = 'free'
): Promise<string> {
  const client = getOpenAI();
  const limits = TOKEN_LIMITS[tier];

  // Build system message (static part + optional context)
  // The static part will be cached by OpenAI for subsequent requests
  const systemMessage = systemContext
    ? `${OPTIMIZATION_SYSTEM_MESSAGE}\n\nAdditional context: ${systemContext}`
    : OPTIMIZATION_SYSTEM_MESSAGE;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: `Optimize this prompt:\n\n${originalPrompt}` },
    ],
    temperature: 0.3,
    max_tokens: limits.maxOutputTokens,
  });

  return response.choices[0]?.message?.content?.trim() || originalPrompt;
}

export async function executePrompt(
  prompt: string,
  tier: UserTier = 'free'
): Promise<{ response: string; tokensUsed: number }> {
  const client = getOpenAI();
  const limits = TOKEN_LIMITS[tier];

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: limits.maxOutputTokens,
  });

  return {
    response: response.choices[0]?.message?.content?.trim() || '',
    tokensUsed: response.usage?.total_tokens || 0,
  };
}

// Streaming version for real-time response display
export async function* executePromptStream(
  prompt: string,
  tier: UserTier = 'free'
): AsyncGenerator<{ chunk?: string; done?: boolean; tokensUsed?: number }> {
  const client = getOpenAI();
  const limits = TOKEN_LIMITS[tier];

  const stream = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: limits.maxOutputTokens,
    stream: true,
  });

  let totalTokens = 0;

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield { chunk: content };
    }
    if (chunk.usage) {
      totalTokens = chunk.usage.total_tokens;
    }
  }

  yield { done: true, tokensUsed: totalTokens };
}
