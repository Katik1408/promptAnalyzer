import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
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

    // Increment usage AFTER successful optimization
    incrementUsage(machineId);

    // Add usage info to response (with updated count)
    const updatedUsage = getUsageStats(machineId);
    const response = {
      ...result,
      usage: {
        remaining: updatedUsage.remaining,
        limit: updatedUsage.limit,
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

// Email transporter for feedback notifications
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send feedback email notification
async function sendFeedbackEmail(feedback: any): Promise<void> {
  const stars = '⭐'.repeat(feedback.rating);
  const improvements = feedback.improvements?.length > 0 
    ? feedback.improvements.join(', ') 
    : 'None specified';

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: 'katik.ks@gmail.com',
    subject: `Prompt Analyzer Feedback: ${feedback.rating}/5 ${stars}`,
    html: `
      <h2>New Feedback Received</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Rating</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${feedback.rating}/5 ${stars}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Quality</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${feedback.quality || 'Not specified'}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Would Use Again</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${feedback.useAgain || 'Not specified'}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Improvements</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${improvements}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Comments</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${feedback.comments || 'No comments'}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>User ID</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${feedback.machineId.slice(0, 12)}...</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Timestamp</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${feedback.timestamp}</td></tr>
      </table>
    `,
  };

  await emailTransporter.sendMail(mailOptions);
}

// Feedback endpoint
app.post('/api/feedback', async (req: Request, res: Response) => {
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

    // Send email notification
    try {
      await sendFeedbackEmail(feedback);
      console.log(`📧 Feedback email sent: ${rating}⭐ from ${machineId.slice(0, 8)}...`);
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Continue even if email fails
    }

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
