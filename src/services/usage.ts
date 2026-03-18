import * as fs from 'fs';
import * as path from 'path';
import { TOKEN_LIMITS, UserTier } from './openai';

interface UsageRecord {
  date: string;
  count: number;
  tier: UserTier;
}

interface UsageData {
  [machineId: string]: UsageRecord;
}

const USAGE_FILE = path.join(process.cwd(), '.promptanalyzer', 'usage.json');

function loadUsageData(): UsageData {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const content = fs.readFileSync(USAGE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error loading usage data:', error);
  }
  return {};
}

function saveUsageData(data: UsageData): void {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving usage data:', error);
  }
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function getUserTier(machineId: string): UserTier {
  // For now, all users are free tier
  // In production, you'd check a database or payment system
  const data = loadUsageData();
  return data[machineId]?.tier || 'free';
}

export function setUserTier(machineId: string, tier: UserTier): void {
  const data = loadUsageData();
  const today = getTodayDate();
  
  if (!data[machineId]) {
    data[machineId] = { date: today, count: 0, tier };
  } else {
    data[machineId].tier = tier;
  }
  
  saveUsageData(data);
}

export function checkUsageLimit(machineId: string): {
  allowed: boolean;
  remaining: number;
  limit: number;
  tier: UserTier;
} {
  const data = loadUsageData();
  const today = getTodayDate();
  const tier = getUserTier(machineId);
  const limits = TOKEN_LIMITS[tier];

  // Get or create usage record
  let record = data[machineId];
  
  if (!record || record.date !== today) {
    // New day or new user - reset count
    record = { date: today, count: 0, tier };
    data[machineId] = record;
    saveUsageData(data);
  }

  const remaining = Math.max(0, limits.dailyLimit - record.count);
  const allowed = record.count < limits.dailyLimit;

  return {
    allowed,
    remaining,
    limit: limits.dailyLimit,
    tier,
  };
}

export function incrementUsage(machineId: string): void {
  const data = loadUsageData();
  const today = getTodayDate();
  const tier = getUserTier(machineId);

  if (!data[machineId] || data[machineId].date !== today) {
    data[machineId] = { date: today, count: 1, tier };
  } else {
    data[machineId].count += 1;
  }

  saveUsageData(data);
}

export function getUsageStats(machineId: string): {
  used: number;
  remaining: number;
  limit: number;
  tier: UserTier;
  resetsAt: string;
} {
  const { remaining, limit, tier } = checkUsageLimit(machineId);
  const data = loadUsageData();
  const used = data[machineId]?.count || 0;

  // Calculate reset time (midnight UTC)
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  return {
    used,
    remaining,
    limit,
    tier,
    resetsAt: tomorrow.toISOString(),
  };
}
