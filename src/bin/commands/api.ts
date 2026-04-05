import { Command } from 'commander';
import { acquireLock } from '../../utils/lockfile';
import { logger } from '../../utils/logger';
import { startApiServer } from '../../api/server';

export async function apiAction(
    _opts?: Record<string, unknown>,
    cmd?: Command,
): Promise<void> {
    // Note: Do not acquireLock() like telegram bot because the whole point is we want to run API
    // separately alongside Telegram Bot potentially. The Telegram Bot uses acquireLock to prevent
    // running two Telegram bots picking up the same messages.
    logger.info('Starting local AgController HTTP API...');
    
    await startApiServer(3100).catch((err) => {
        logger.error('Failed to start API:', err);
        process.exit(1);
    });
}
