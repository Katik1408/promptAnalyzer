import * as fs from 'fs';
import * as path from 'path';
import { CompanyRules, Rule, RuleViolation } from '../types';

const DEFAULT_RULES: CompanyRules = {
  companyName: 'Default',
  rules: [],
  optimization: {
    removeFillerWords: true,
    enforceStructure: true,
  },
};

export function loadRules(rulesPath?: string): CompanyRules {
  const defaultPath = path.join(process.cwd(), 'data', 'rules.json');
  const filePath = rulesPath || defaultPath;

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as CompanyRules;
    }
  } catch (error) {
    console.error('Error loading rules:', error);
  }

  return DEFAULT_RULES;
}

export function checkRules(prompt: string, rules: Rule[], tokenCount: number): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const rule of rules) {
    // Check pattern-based rules (regex)
    if (rule.pattern) {
      const regex = new RegExp(rule.pattern, 'gi');
      if (regex.test(prompt)) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: rule.action,
          message: rule.message,
        });
      }
    }

    // Check token limit rules
    if (rule.maxTokens && tokenCount > rule.maxTokens) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        message: rule.message,
      });
    }

    // Check mustInclude rules
    if (rule.mustInclude && rule.mustInclude.length > 0) {
      const promptLower = prompt.toLowerCase();
      const missing = rule.mustInclude.filter(
        (term) => !promptLower.includes(term.toLowerCase())
      );
      if (missing.length > 0) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: rule.action,
          message: `${rule.message}. Missing: ${missing.join(', ')}`,
        });
      }
    }
  }

  return violations;
}

export function hasBlockingViolation(violations: RuleViolation[]): boolean {
  return violations.some((v) => v.action === 'block');
}
