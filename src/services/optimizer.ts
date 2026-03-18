import { OptimizationResult, CompanyRules } from '../types';
import { checkRules, hasBlockingViolation } from './rules';
import { optimizePrompt, countTokens, UserTier } from './openai';

export async function analyzeAndOptimize(
  originalPrompt: string,
  rules: CompanyRules,
  tier: UserTier = 'free'
): Promise<OptimizationResult> {
  const originalTokens = countTokens(originalPrompt);

  // Check rules on original prompt
  const violations = checkRules(originalPrompt, rules.rules, originalTokens);
  const canProceed = !hasBlockingViolation(violations);

  // If there's a blocking violation, don't optimize - return early
  if (!canProceed) {
    return {
      originalPrompt,
      optimizedPrompt: originalPrompt,
      originalTokens,
      optimizedTokens: originalTokens,
      tokenSavings: 0,
      savingsPercentage: 0,
      violations,
      canProceed: false,
    };
  }

  // Optimize the prompt using OpenAI
  const optimizedPrompt = await optimizePrompt(
    originalPrompt,
    rules.optimization.addSystemContext,
    tier
  );

  const optimizedTokens = countTokens(optimizedPrompt);
  const tokenSavings = originalTokens - optimizedTokens;
  const savingsPercentage = originalTokens > 0 
    ? Math.round((tokenSavings / originalTokens) * 100) 
    : 0;

  // Check rules on optimized prompt as well
  const optimizedViolations = checkRules(optimizedPrompt, rules.rules, optimizedTokens);

  return {
    originalPrompt,
    optimizedPrompt,
    originalTokens,
    optimizedTokens,
    tokenSavings,
    savingsPercentage,
    violations: [...violations, ...optimizedViolations.filter(v => v.action === 'suggest')],
    canProceed: !hasBlockingViolation(optimizedViolations),
  };
}
