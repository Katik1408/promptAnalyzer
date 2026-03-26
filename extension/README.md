# RePromptr

AI-powered prompt optimization for VS Code. Select a prompt, optimize it through your configured backend API, and copy the improved version with token savings details.

## Features

- Prompt optimization preview before use
- Token comparison and savings percentage
- Rule-violation display (block/warn/suggest)
- One-click copy of optimized prompt
- In-panel feedback form
- Free-tier usage tracking from backend

## Getting Started

1. Install the extension.
2. Open VS Code settings and search for `Prompt Analyzer: Api Base Url`.
3. Set your backend URL if different from default.
4. Select prompt text in an editor file.
5. Run `Run RePromptr` from Command Palette.
6. On first use, accept the consent prompt to allow API processing.

## Configuration

This extension contributes the following setting:

- `promptanalyzer.apiBaseUrl`: Backend API base URL used for optimization and feedback requests.

Default value:

`https://promptanalyzer-production.up.railway.app`

## Privacy and Data Flow

When you run the command, the extension sends the following to the configured backend API:

- Selected prompt text
- Anonymous machine identifier (`vscode.env.machineId`) in request headers
- Optional feedback form fields when submitted

The extension does not directly send your data to OpenAI. Your configured backend is responsible for any upstream AI provider calls.

On first command run, the extension asks for consent before sending prompt content to the backend API.

## Troubleshooting

- If you see backend connection errors, verify `promptanalyzer.apiBaseUrl`.
- If usage limit is reached, wait for reset or upgrade backend plan/tier.
- If optimization fails, check backend logs and API key configuration.

## Pricing

| Tier | Prompts/Day | Price |
|------|-------------|-------|
| Free | 5 | $0 |
| Pro | Unlimited | Coming Soon |

## Repository

`https://github.com/Katik1408/promptAnalyzer`

## License

MIT
