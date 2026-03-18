import * as vscode from 'vscode';
import axios from 'axios';

const API_BASE = 'http://localhost:4000';

// Get unique machine ID for usage tracking
function getMachineId(): string {
    return vscode.env.machineId;
}

// Common headers for all API requests
function getHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'x-machine-id': getMachineId(),
    };
}

interface UsageInfo {
    remaining: number;
    limit: number;
    tier: 'free' | 'pro';
}

interface OptimizationResult {
    originalPrompt: string;
    optimizedPrompt: string;
    originalTokens: number;
    optimizedTokens: number;
    tokenSavings: number;
    savingsPercentage: number;
    violations: Array<{
        ruleId: string;
        ruleName: string;
        action: 'block' | 'warn' | 'suggest';
        message: string;
    }>;
    canProceed: boolean;
    usage?: UsageInfo;
}

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('promptanalyzer.runPrompt', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const selectedText = editor.document.getText(editor.selection).trim();

        if (!selectedText || selectedText.length === 0) {
            vscode.window.showErrorMessage('Please select some text first');
            return;
        }

        // Minimum length check to avoid wasting API calls on tiny prompts
        if (selectedText.length < 3) {
            vscode.window.showErrorMessage('Selected text is too short to optimize');
            return;
        }

        try {
            vscode.window.showInformationMessage('🔍 Analyzing and optimizing prompt...');

            // Step 1: Get optimization preview
            const optimizeResponse = await axios.post(
                `${API_BASE}/api/prompt/optimize`,
                { prompt: selectedText },
                { headers: getHeaders() }
            );

            const result: OptimizationResult = optimizeResponse.data;

            // Step 2: Show preview panel with confirm/reject
            showOptimizationPreview(result);

        } catch (error: any) {
            if (error.response?.status === 429) {
                const usage = error.response?.data?.usage;
                vscode.window.showErrorMessage(
                    `Daily limit reached (${usage?.limit || 5} prompts). Upgrade to Pro for unlimited access.`
                );
            } else {
                const message = error.response?.data?.error || 'Error connecting to backend. Is the server running?';
                vscode.window.showErrorMessage(message);
            }
        }
    });

    context.subscriptions.push(disposable);
}

function showOptimizationPreview(result: OptimizationResult) {
    const panel = vscode.window.createWebviewPanel(
        'promptAnalyzer',
        'Prompt Analyzer',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    const violationsHtml = result.violations.length > 0
        ? `<div class="violations">
            <h3>⚠️ Rule Violations</h3>
            ${result.violations.map(v => `
                <div class="violation ${v.action}">
                    <strong>${v.ruleName}</strong>: ${v.message}
                </div>
            `).join('')}
           </div>`
        : '';

    const canProceedClass = result.canProceed ? '' : 'blocked';
    const buttonHtml = result.canProceed
        ? `<button id="copyBtn" class="btn confirm">📋 Copy Optimized Prompt</button>
           <button id="closeBtn" class="btn reject">✗ Close</button>`
        : `<button id="closeBtn" class="btn reject">✗ Close (Blocked by Rules)</button>`;

    const usageHtml = result.usage
        ? `<div class="usage-bar">
            <span class="tier-badge ${result.usage.tier}">${result.usage.tier.toUpperCase()}</span>
            <span>${result.usage.remaining}/${result.usage.limit} prompts remaining today</span>
            <button id="upgradeBtn" class="btn upgrade" title="Pro version coming soon!">⭐ Upgrade to Pro - Coming Soon</button>
           </div>`
        : '';

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    padding: 20px;
                    color: #e0e0e0;
                    background: #1e1e1e;
                }
                h2 { color: #569cd6; margin-bottom: 5px; }
                h3 { color: #9cdcfe; margin-top: 20px; }
                .section {
                    background: #2d2d2d;
                    border-radius: 8px;
                    padding: 15px;
                    margin: 15px 0;
                }
                .stats {
                    display: flex;
                    gap: 20px;
                    margin: 15px 0;
                    flex-wrap: wrap;
                }
                .stat {
                    background: #3c3c3c;
                    padding: 10px 20px;
                    border-radius: 6px;
                    text-align: center;
                }
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #4ec9b0;
                }
                .stat-label { font-size: 12px; color: #888; }
                .savings { color: #6a9955 !important; }
                pre {
                    background: #1a1a1a;
                    padding: 15px;
                    border-radius: 6px;
                    overflow-x: auto;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin: 0;
                }
                .violations { margin: 15px 0; }
                .violation {
                    padding: 10px;
                    border-radius: 4px;
                    margin: 5px 0;
                }
                .violation.block { background: #5a1d1d; border-left: 4px solid #f44336; }
                .violation.warn { background: #4a3d1d; border-left: 4px solid #ff9800; }
                .violation.suggest { background: #1d3a4a; border-left: 4px solid #2196f3; }
                .buttons {
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                }
                .btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                }
                .btn.confirm {
                    background: #4caf50;
                    color: white;
                }
                .btn.confirm:hover { background: #45a049; }
                .btn.reject {
                    background: #666;
                    color: white;
                }
                .btn.reject:hover { background: #555; }
                .loading {
                    display: none;
                    align-items: center;
                    gap: 10px;
                    color: #888;
                    margin-top: 20px;
                }
                .spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid #888;
                    border-top-color: #4ec9b0;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .response-section { display: none; margin-top: 20px; }
                .response-content {
                    background: #1a1a1a;
                    padding: 15px;
                    border-radius: 6px;
                    border-left: 4px solid #4ec9b0;
                }
                .usage-bar {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    background: #2d2d2d;
                    border-radius: 6px;
                    margin-bottom: 15px;
                    font-size: 13px;
                }
                .tier-badge {
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: bold;
                }
                .tier-badge.free { background: #666; color: #fff; }
                .tier-badge.pro { background: #9333ea; color: #fff; }
                .btn.upgrade {
                    margin-left: auto;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 6px 12px;
                    font-size: 11px;
                    cursor: not-allowed;
                    opacity: 0.8;
                }
                .btn.upgrade:hover {
                    opacity: 1;
                }
                .streaming-cursor {
                    display: inline-block;
                    width: 8px;
                    height: 16px;
                    background: #4ec9b0;
                    animation: blink 1s infinite;
                    vertical-align: middle;
                    margin-left: 2px;
                }
                @keyframes blink { 50% { opacity: 0; } }
                
                /* Feedback Form Styles */
                .feedback-section {
                    margin-top: 25px;
                    padding-top: 20px;
                    border-top: 1px solid #444;
                }
                .feedback-form {
                    background: #2d2d2d;
                    border-radius: 8px;
                    padding: 15px;
                }
                .feedback-field {
                    margin-bottom: 15px;
                }
                .feedback-field label {
                    display: block;
                    margin-bottom: 6px;
                    color: #9cdcfe;
                    font-size: 13px;
                }
                .star-rating {
                    font-size: 24px;
                    cursor: pointer;
                }
                .star-rating .star {
                    color: #555;
                    transition: color 0.2s;
                }
                .star-rating .star.active,
                .star-rating .star:hover {
                    color: #ffd700;
                }
                .feedback-field select {
                    width: 100%;
                    padding: 8px;
                    background: #3c3c3c;
                    border: 1px solid #555;
                    border-radius: 4px;
                    color: #e0e0e0;
                    font-size: 13px;
                }
                .radio-group, .checkbox-group {
                    display: flex;
                    gap: 15px;
                    flex-wrap: wrap;
                }
                .radio-group label, .checkbox-group label {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    cursor: pointer;
                    color: #e0e0e0;
                }
                .feedback-field textarea {
                    width: 100%;
                    padding: 8px;
                    background: #3c3c3c;
                    border: 1px solid #555;
                    border-radius: 4px;
                    color: #e0e0e0;
                    font-size: 13px;
                    resize: vertical;
                    font-family: inherit;
                }
                #feedbackStatus {
                    margin-left: 10px;
                    font-size: 12px;
                }
                #feedbackStatus.success { color: #4ec9b0; }
                #feedbackStatus.error { color: #f44747; }
            </style>
        </head>
        <body>
            <h2>🔍 Prompt Analyzer</h2>

            ${usageHtml}

            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${result.originalTokens}</div>
                    <div class="stat-label">Original Tokens</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${result.optimizedTokens}</div>
                    <div class="stat-label">Optimized Tokens</div>
                </div>
                <div class="stat">
                    <div class="stat-value savings">${result.savingsPercentage}%</div>
                    <div class="stat-label">Saved</div>
                </div>
            </div>

            ${violationsHtml}

            <div class="section">
                <h3>📝 Original Prompt</h3>
                <pre>${escapeHtml(result.originalPrompt)}</pre>
            </div>

            <div class="section">
                <h3>✨ Optimized Prompt</h3>
                <pre>${escapeHtml(result.optimizedPrompt)}</pre>
            </div>

            <div class="buttons ${canProceedClass}">
                ${buttonHtml}
            </div>

            <!-- Feedback Section -->
            <div class="feedback-section" id="feedbackSection">
                <h3>💬 Share Your Feedback</h3>
                <div class="feedback-form">
                    <div class="feedback-field">
                        <label>Rating</label>
                        <div class="star-rating" id="starRating">
                            <span class="star" data-value="1">☆</span>
                            <span class="star" data-value="2">☆</span>
                            <span class="star" data-value="3">☆</span>
                            <span class="star" data-value="4">☆</span>
                            <span class="star" data-value="5">☆</span>
                        </div>
                    </div>
                    <div class="feedback-field">
                        <label>Optimization Quality</label>
                        <select id="qualitySelect">
                            <option value="">Select...</option>
                            <option value="poor">Poor</option>
                            <option value="fair">Fair</option>
                            <option value="good">Good</option>
                            <option value="excellent">Excellent</option>
                        </select>
                    </div>
                    <div class="feedback-field">
                        <label>Would you use this again?</label>
                        <div class="radio-group">
                            <label><input type="radio" name="useAgain" value="yes"> Yes</label>
                            <label><input type="radio" name="useAgain" value="no"> No</label>
                            <label><input type="radio" name="useAgain" value="maybe"> Maybe</label>
                        </div>
                    </div>
                    <div class="feedback-field">
                        <label>What could be improved?</label>
                        <div class="checkbox-group">
                            <label><input type="checkbox" name="improve" value="speed"> Speed</label>
                            <label><input type="checkbox" name="improve" value="accuracy"> Accuracy</label>
                            <label><input type="checkbox" name="improve" value="ui"> UI/UX</label>
                            <label><input type="checkbox" name="improve" value="savings"> Token Savings</label>
                        </div>
                    </div>
                    <div class="feedback-field">
                        <label>Additional Comments (optional)</label>
                        <textarea id="commentsText" rows="3" placeholder="Tell us what you think..."></textarea>
                    </div>
                    <button id="submitFeedback" class="btn confirm">📤 Submit Feedback</button>
                    <span id="feedbackStatus"></span>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const optimizedPrompt = ${JSON.stringify(result.optimizedPrompt)};

                document.getElementById('copyBtn')?.addEventListener('click', () => {
                    navigator.clipboard.writeText(optimizedPrompt).then(() => {
                        const btn = document.getElementById('copyBtn');
                        btn.textContent = '✓ Copied!';
                        btn.style.background = '#45a049';
                        setTimeout(() => {
                            btn.textContent = '📋 Copy Optimized Prompt';
                            btn.style.background = '';
                        }, 2000);
                    });
                });

                document.getElementById('closeBtn')?.addEventListener('click', () => {
                    vscode.postMessage({ command: 'close' });
                });

                document.getElementById('upgradeBtn')?.addEventListener('click', () => {
                    vscode.postMessage({ command: 'upgrade' });
                });

                // Star rating functionality
                let selectedRating = 0;
                document.querySelectorAll('.star').forEach(star => {
                    star.addEventListener('click', () => {
                        selectedRating = parseInt(star.dataset.value);
                        document.querySelectorAll('.star').forEach((s, i) => {
                            s.textContent = i < selectedRating ? '★' : '☆';
                            s.classList.toggle('active', i < selectedRating);
                        });
                    });
                    star.addEventListener('mouseenter', () => {
                        const val = parseInt(star.dataset.value);
                        document.querySelectorAll('.star').forEach((s, i) => {
                            s.textContent = i < val ? '★' : '☆';
                        });
                    });
                    star.addEventListener('mouseleave', () => {
                        document.querySelectorAll('.star').forEach((s, i) => {
                            s.textContent = i < selectedRating ? '★' : '☆';
                        });
                    });
                });

                // Submit feedback
                document.getElementById('submitFeedback')?.addEventListener('click', () => {
                    const quality = document.getElementById('qualitySelect').value;
                    const useAgain = document.querySelector('input[name="useAgain"]:checked')?.value || '';
                    const improvements = Array.from(document.querySelectorAll('input[name="improve"]:checked')).map(cb => cb.value);
                    const comments = document.getElementById('commentsText').value;

                    if (selectedRating === 0) {
                        document.getElementById('feedbackStatus').textContent = 'Please select a rating';
                        document.getElementById('feedbackStatus').className = 'error';
                        return;
                    }

                    vscode.postMessage({
                        command: 'submitFeedback',
                        feedback: {
                            rating: selectedRating,
                            quality,
                            useAgain,
                            improvements,
                            comments
                        }
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'feedbackSuccess') {
                        document.getElementById('feedbackStatus').textContent = '✓ Thank you for your feedback!';
                        document.getElementById('feedbackStatus').className = 'success';
                        document.getElementById('submitFeedback').disabled = true;
                        document.getElementById('submitFeedback').textContent = '✓ Submitted';
                    } else if (message.command === 'feedbackError') {
                        document.getElementById('feedbackStatus').textContent = 'Failed to submit. Try again.';
                        document.getElementById('feedbackStatus').className = 'error';
                    }
                });
            </script>
        </body>
        </html>
    `;

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'close') {
            panel.dispose();
        } else if (message.command === 'upgrade') {
            vscode.window.showInformationMessage(
                '⭐ Pro version coming soon! Get unlimited prompts, higher token limits, and priority support.',
                'Notify Me'
            ).then(selection => {
                if (selection === 'Notify Me') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/acronite/promptanalyzer'));
                }
            });
        } else if (message.command === 'submitFeedback') {
            try {
                await axios.post(
                    `${API_BASE}/api/feedback`,
                    message.feedback,
                    { headers: getHeaders() }
                );
                panel.webview.postMessage({ command: 'feedbackSuccess' });
            } catch {
                panel.webview.postMessage({ command: 'feedbackError' });
            }
        }
    });
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function deactivate() {}