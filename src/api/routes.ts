import type { Express, Request, Response, RequestHandler } from 'express';
import { AgController } from '../controller/agController';
import { WorkspaceLock } from '../utils/workspaceLock';
import { logger } from '../utils/logger';

export function setupApiRoutes(app: Express, agController: AgController) {
    const requireWorkspace = (handler: (req: Request, res: Response, workspacePath: string) => Promise<void>): RequestHandler => {
        return async (req: Request, res: Response, next) => {
            try {
                const workspacePath = req.query.workspacePath || req.body?.workspacePath;
                if (!workspacePath || typeof workspacePath !== 'string') {
                    res.status(400).json({
                        ok: false,
                        status: 'error',
                        summary: 'Missing workspacePath in query or body',
                    });
                    return;
                }
                await handler(req, res, workspacePath);
            } catch (err) {
                logger.error('[API] Error handling request:', err);
                // Return generic 500
                res.status(500).json({
                    ok: false,
                    status: 'error',
                    summary: 'Internal Server Error',
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        };
    };

    /**
     * Rejects request if the workspace is currently busy across ANY process.
     */
    const withConcurrencyCheck = (handler: (req: Request, res: Response, workspacePath: string) => Promise<void>) => {
        return requireWorkspace(async (req, res, workspacePath) => {
            const isLocked = await WorkspaceLock.isLocked(workspacePath);
            if (isLocked) {
                res.status(409).json({
                    ok: false,
                    status: 'error',
                    summary: 'Workspace is currently busy across another process.'
                });
                return;
            }
            await handler(req, res, workspacePath);
        });
    };

    app.post('/api/new-chat', withConcurrencyCheck(async (req, res, workspacePath) => {
        const { title } = req.body;
        const result = await agController.newChat(workspacePath, title);
        res.json(result);
    }));

    app.get('/api/chat-info', requireWorkspace(async (req, res, workspacePath) => {
        const result = await agController.getChatInfo(workspacePath);
        res.json(result);
    }));

    app.post('/api/switch-model', withConcurrencyCheck(async (req, res, workspacePath) => {
        const { modelName } = req.body;
        if (!modelName) {
            res.status(400).json({ ok: false, status: 'error', summary: 'Missing modelName' });
            return;
        }
        const result = await agController.switchModel(workspacePath, modelName);
        res.json(result);
    }));

    app.post('/api/switch-mode', withConcurrencyCheck(async (req, res, workspacePath) => {
        const { mode } = req.body;
        if (!mode) {
            res.status(400).json({ ok: false, status: 'error', summary: 'Missing mode' });
            return;
        }
        const result = await agController.switchMode(workspacePath, mode);
        res.json(result);
    }));

    app.post('/api/send-task', requireWorkspace(async (req, res, workspacePath) => {
        // We use requireWorkspace instead of withConcurrencyCheck here because
        // AgController.sendTask implicitly checks lock AND acquires it via PromptDispatcher.
        // It provides a "Workspace is currently busy." itself.
        const { prompt, options } = req.body;
        if (!prompt) {
            res.status(400).json({ ok: false, status: 'error', summary: 'Missing prompt' });
            return;
        }
        const result = await agController.sendTask(workspacePath, prompt, options || {});
        res.json(result);
    }));

    app.get('/api/run-status', requireWorkspace(async (req, res, workspacePath) => {
        const result = await agController.getRunStatus(workspacePath, req.body?.options || {});
        res.json(result);
    }));

    app.post('/api/stop-run', requireWorkspace(async (req, res, workspacePath) => {
        const result = await agController.stopRun(workspacePath);
        res.json(result);
    }));
}
