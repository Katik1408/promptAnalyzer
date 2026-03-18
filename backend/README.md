# Prompt Analyzer - Backend API

Express.js backend for the Prompt Analyzer VS Code extension.

## Deploy to Railway

### 1. Create Railway Account
Go to [railway.app](https://railway.app) and sign up.

### 2. Connect GitHub
- Push this `backend` folder to a GitHub repo (or use the monorepo)
- In Railway, click "New Project" → "Deploy from GitHub repo"
- Select your repo

### 3. Configure Root Directory
If using monorepo, set the root directory to `backend`:
- Go to Settings → Root Directory → Set to `backend`

### 4. Add Environment Variables
In Railway dashboard → Variables:
```
OPENAI_API_KEY=sk-your-key-here
PORT=4000
```

### 5. Deploy
Railway will auto-deploy. You'll get a URL like:
```
https://promptanalyzer-production.up.railway.app
```

## Local Development

```bash
npm install
cp .env.example .env  # Add your OPENAI_API_KEY
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/usage` | Get usage stats |
| POST | `/api/prompt/optimize` | Optimize a prompt |
| POST | `/api/prompt/execute` | Execute a prompt |
| POST | `/api/prompt/execute/stream` | Execute with streaming |
| POST | `/api/feedback` | Submit feedback |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `PORT` | No | Server port (default: 4000) |

## Data Storage

The backend stores data in the `data/` folder:
- `usage.json` - User usage tracking
- `feedback.json` - User feedback
- `rules.json` - Custom optimization rules (optional)

**Note:** On Railway, this data is ephemeral. For production, consider using a database like PostgreSQL or Redis.
