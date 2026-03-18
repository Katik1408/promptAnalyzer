import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { initOpenAI, executePrompt, executePromptStream, TOKEN_LIMITS } from './services/openai';
import { loadRules } from './services/rules';
import { analyzeAndOptimize } from './services/optimizer';
import { checkUsageLimit, incrementUsage, getUsageStats, getUserTier } from './services/usage';
import { OptimizationResult, ExecuteResult } from './types';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey || apiKey === 'your_openai_api_key_here') {
  console.error('⚠️  WARNING: OPENAI_API_KEY not set in .env file');
} else {
  initOpenAI(apiKey);
  console.log('✅ OpenAI initialized');
}

// Load company rules
const rules = loadRules();
console.log(`📋 Loaded rules for: ${rules.companyName || 'Default'}`);

// Middleware to extract machineId
function getMachineId(req: Request): string {
  return (req.headers['x-machine-id'] as string) || 'anonymous';
}

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', rulesLoaded: rules.companyName });
});

// Get usage stats for a machine
app.get('/api/usage', (req: Request, res: Response) => {
  const machineId = getMachineId(req);
  const stats = getUsageStats(machineId);
  res.json(stats);
});

// Optimize prompt (returns preview for user confirmation)
app.post('/api/prompt/optimize', async (req: Request, res: Response) => {
  try {
    const machineId = getMachineId(req);
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    // Validate non-empty after trimming (prevent wasting API calls)
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      res.status(400).json({ error: 'Prompt cannot be empty' });
      return;
    }

    if (trimmedPrompt.length < 3) {
      res.status(400).json({ error: 'Prompt is too short to optimize' });
      return;
    }

    // Check usage limit
    const usage = checkUsageLimit(machineId);
    if (!usage.allowed) {
      res.status(429).json({
        error: 'Daily limit reached',
        message: `You've used all ${usage.limit} free prompts today. Upgrade to Pro for unlimited access.`,
        usage: getUsageStats(machineId),
      });
      return;
    }

    const tier = getUserTier(machineId);
    console.log(`📝 Optimizing prompt for ${machineId} (${tier} tier, ${usage.remaining} remaining)...`);
    
    const result: OptimizationResult = await analyzeAndOptimize(prompt, rules, tier);

    // Add usage info to response
    const response = {
      ...result,
      usage: {
        remaining: usage.remaining,
        limit: usage.limit,
        tier,
      },
    };

    console.log(`✨ Optimization complete: ${result.originalTokens} → ${result.optimizedTokens} tokens (${result.savingsPercentage}% saved)`);

    res.json(response);
  } catch (error) {
    console.error('Error optimizing prompt:', error);
    res.status(500).json({ error: 'Failed to optimize prompt' });
  }
});

// Execute optimized prompt (called after user confirms)
app.post('/api/prompt/execute', async (req: Request, res: Response) => {
  try {
    const machineId = getMachineId(req);
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    // Check usage limit
    const usage = checkUsageLimit(machineId);
    if (!usage.allowed) {
      res.status(429).json({
        error: 'Daily limit reached',
        message: `You've used all ${usage.limit} free prompts today.`,
        usage: getUsageStats(machineId),
      });
      return;
    }

    const tier = getUserTier(machineId);
    console.log(`🚀 Executing prompt for ${machineId} (${tier} tier)...`);
    
    const result: ExecuteResult = await executePrompt(prompt, tier);

    // Increment usage after successful execution
    incrementUsage(machineId);

    console.log(`✅ Execution complete: ${result.tokensUsed} tokens used`);

    res.json({
      ...result,
      usage: getUsageStats(machineId),
    });
  } catch (error) {
    console.error('Error executing prompt:', error);
    res.status(500).json({ error: 'Failed to execute prompt' });
  }
});

// Streaming execute endpoint (Server-Sent Events)
app.post('/api/prompt/execute/stream', async (req: Request, res: Response) => {
  const machineId = getMachineId(req);
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  // Check usage limit
  const usage = checkUsageLimit(machineId);
  if (!usage.allowed) {
    res.status(429).json({
      error: 'Daily limit reached',
      message: `You've used all ${usage.limit} free prompts today.`,
    });
    return;
  }

  const tier = getUserTier(machineId);
  console.log(`🚀 Streaming response for ${machineId} (${tier} tier)...`);

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = executePromptStream(prompt, tier);

    for await (const event of stream) {
      if (event.chunk) {
        res.write(`data: ${JSON.stringify({ chunk: event.chunk })}\n\n`);
      }
      if (event.done) {
        // Increment usage after successful execution
        incrementUsage(machineId);
        res.write(`data: ${JSON.stringify({ done: true, tokensUsed: event.tokensUsed, usage: getUsageStats(machineId) })}\n\n`);
      }
    }

    res.end();
  } catch (error) {
    console.error('Streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    res.end();
  }
});

// Legacy endpoint (for backward compatibility)
app.post('/api/prompt/run', async (req: Request, res: Response) => {
  try {
    const machineId = getMachineId(req);
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    // Check usage limit
    const usage = checkUsageLimit(machineId);
    if (!usage.allowed) {
      res.status(429).json({
        error: 'Daily limit reached',
        message: `You've used all ${usage.limit} free prompts today.`,
      });
      return;
    }

    const tier = getUserTier(machineId);

    // Optimize first
    const optimized = await analyzeAndOptimize(prompt, rules, tier);

    if (!optimized.canProceed) {
      res.status(400).json({
        error: 'Prompt blocked by rules',
        violations: optimized.violations,
      });
      return;
    }

    // Execute
    const result = await executePrompt(optimized.optimizedPrompt, tier);

    // Increment usage
    incrementUsage(machineId);

    res.json({
      response: result.response,
      optimization: {
        originalTokens: optimized.originalTokens,
        optimizedTokens: optimized.optimizedTokens,
        savingsPercentage: optimized.savingsPercentage,
      },
      usage: getUsageStats(machineId),
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to process prompt' });
  }
});

// Feedback endpoint
app.post('/api/feedback', (req: Request, res: Response) => {
  try {
    const machineId = getMachineId(req);
    const { rating, quality, useAgain, improvements, comments } = req.body;

    const feedback = {
      machineId,
      rating,
      quality,
      useAgain,
      improvements,
      comments,
      timestamp: new Date().toISOString(),
    };

    // Store feedback in a JSON file
    const feedbackPath = path.join(process.cwd(), '.promptanalyzer', 'feedback.json');
    let feedbackData: any[] = [];
    
    if (fs.existsSync(feedbackPath)) {
      feedbackData = JSON.parse(fs.readFileSync(feedbackPath, 'utf-8'));
    }
    
    feedbackData.push(feedback);
    fs.writeFileSync(feedbackPath, JSON.stringify(feedbackData, null, 2));

    console.log(`📝 Feedback received: ${rating}⭐ from ${machineId.slice(0, 8)}...`);
    res.json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Free tier: ${TOKEN_LIMITS.free.dailyLimit} prompts/day, max ${TOKEN_LIMITS.free.maxOutputTokens} output tokens`);
  console.log(`💎 Pro tier: Unlimited prompts, max ${TOKEN_LIMITS.pro.maxOutputTokens} output tokens`);
});