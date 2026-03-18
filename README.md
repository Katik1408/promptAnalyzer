# Prompt Analyzer - Monorepo

AI-powered prompt optimization for LLMs. Save tokens and money by automatically optimizing prompts before sending to GPT, Claude, etc.

## Project Structure

```
promptanalyzer/
├── backend/          # Express API server (deploy to Railway)
│   ├── src/
│   │   ├── server.ts
│   │   └── services/
│   └── package.json
│
├── extension/        # VS Code Extension (publish to Marketplace)
│   ├── src/
│   │   └── extension.ts
│   └── package.json
│
└── src/              # Legacy (can be removed after migration)
```

## Quick Start

### Backend (Railway Deployment)

```bash
cd backend
npm install
cp .env.example .env  # Add your OPENAI_API_KEY
npm run dev
```

### Extension (VS Code Marketplace)

```bash
cd extension
npm install
# Update API_BASE in src/extension.ts to your Railway URL
npm run package
npx vsce package
```

---

# Original README

A VS Code extension that analyzes, optimizes, and executes prompts using AI. Save tokens and money by automatically optimizing your prompts before sending them to LLMs.

## Features

- **AI-Powered Prompt Optimization** — Automatically removes filler words, restructures for clarity, and compresses prompts
- **Token Savings Visualization** — See exactly how many tokens you're saving
- **Custom Company Rules** — Define organization-specific rules (no PII, no secrets, required context, etc.)
- **Preview Before Send** — Review optimized prompts with Confirm/Reject buttons
- **Rule Violations** — Block, warn, or suggest based on configurable rules
- **Streaming Responses** — Real-time AI response display
- **Usage Tracking** — Free tier with 5 prompts/day (Pro coming soon!)
- **Cost Optimized** — Uses gpt-4o-mini with optimized system prompts

## Pricing

| Tier | Prompts/Day | Max Output Tokens | Price |
|------|-------------|-------------------|-------|
| **Free** | 5 | 500 | $0 |
| **Pro** | Unlimited | 2000 | Coming Soon |

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure OpenAI API Key

Copy `.env.example` to `.env` and add your OpenAI API key:

```bash
cp .env.example .env
```

Edit `.env`:
```
OPENAI_API_KEY=sk-your-api-key-here
PORT=4000
```

### 3. Start the Backend Server

```bash
tsx src/server.ts
```

### 4. Run the Extension

Press `F5` in VS Code to launch the extension in debug mode.

### 5. Use the Extension

1. Select text in the editor
2. Open Command Palette (`Cmd+Shift+P`)
3. Run "Run Prompt Analyzer"
4. Review the optimized prompt
5. Click "Confirm & Send to AI" or "Reject"

## Company Rules Configuration

Create `.promptanalyzer/rules.json` in your project root:

```json
{
  "companyName": "Your Company",
  "rules": [
    {
      "id": "no-pii",
      "name": "No Personal Information",
      "pattern": "(email|phone|ssn)",
      "action": "block",
      "message": "Remove personal information"
    },
    {
      "id": "max-tokens",
      "name": "Token Limit",
      "maxTokens": 1000,
      "action": "warn",
      "message": "Prompt exceeds token limit"
    }
  ],
  "optimization": {
    "removeFillerWords": true,
    "enforceStructure": true,
    "addSystemContext": "You are helping developers at Your Company."
  }
}
```

### Rule Actions

| Action | Behavior |
|--------|----------|
| `block` | Prevents prompt from being sent |
| `warn` | Shows warning but allows sending |
| `suggest` | Shows suggestion for improvement |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/usage` | GET | Get usage stats for machine |
| `/api/prompt/optimize` | POST | Analyze and optimize prompt |
| `/api/prompt/execute` | POST | Send prompt to OpenAI |
| `/api/prompt/execute/stream` | POST | Streaming response (SSE) |
| `/api/prompt/run` | POST | Full pipeline (optimize + execute) |

## Development

```bash
# Compile extension
npm run compile

# Watch mode
npm run watch

# Run tests
npm test
```

## License

MIT
