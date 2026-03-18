export interface Rule {
  id: string;
  name: string;
  description?: string;
  pattern?: string;
  maxTokens?: number;
  mustInclude?: string[];
  action: 'block' | 'warn' | 'suggest';
  message: string;
}

export interface CompanyRules {
  companyName?: string;
  rules: Rule[];
  optimization: {
    removeFillerWords: boolean;
    enforceStructure: boolean;
    addSystemContext?: string;
  };
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  action: 'block' | 'warn' | 'suggest';
  message: string;
}

export interface OptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  originalTokens: number;
  optimizedTokens: number;
  tokenSavings: number;
  savingsPercentage: number;
  violations: RuleViolation[];
  canProceed: boolean;
}

export interface ExecuteResult {
  response: string;
  tokensUsed: number;
}
