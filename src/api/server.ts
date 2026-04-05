import express from 'express';
import { setupApiRoutes } from './routes';
import { initAppServices } from '../bootstrap';
import { sendPromptToAntigravity } from '../bot/index';
import { logger } from '../utils/logger';

export async function startApiServer(port: number = 3100) {
    const services = await initAppServices(undefined, sendPromptToAntigravity);
    
    const app = express();
    app.use(express.json());

    setupApiRoutes(app, services.agController);

    return new Promise<void>((resolve, reject) => {
        const server = app.listen(port, '127.0.0.1', () => {
            logger.info(`[API] Server listening on http://127.0.0.1:${port}`);
            resolve();
        });

        server.on('error', (err) => {
            logger.error('[API] Server failed to start:', err);
            reject(err);
        });
    });
}
