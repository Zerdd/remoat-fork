import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * A simple file-based lock to prevent concurrent write operations on the same workspace
 * across different processes (e.g., bot vs HTTP API).
 */
export class WorkspaceLock {
    private static getLockFilePath(workspacePath: string): string {
        return path.join(workspacePath, '.ag_busy.lock');
    }

    /**
     * Attempt to acquire a lock for the specific workspace.
     * Throws an error if the lock is already held.
     */
    public static async acquire(workspacePath: string): Promise<void> {
        const lockPath = this.getLockFilePath(workspacePath);
        try {
            // Using wx flag: fails if file already exists
            const handle = await fs.open(lockPath, 'wx');
            // Write timestamp and PID for debugging
            await handle.write(`LOCKED_BY_PID=${process.pid}\nTIMESTAMP=${Date.now()}`);
            await handle.close();
        } catch (e: any) {
            if (e.code === 'EEXIST') {
                // Determine if the lock is stale (e.g. older than 2 minutes)
                try {
                    const stats = await fs.stat(lockPath);
                    if (Date.now() - stats.mtimeMs > 120_000) {
                        await fs.unlink(lockPath); // Remove stale lock
                        return this.acquire(workspacePath); // Retry
                    }
                } catch {
                    // Ignore stat/unlink errors
                }
                throw new Error('Workspace is currently busy across another process.');
            }
            throw e; // Other FS errors
        }
    }

    /**
     * Release the lock for the specific workspace.
     */
    public static async release(workspacePath: string): Promise<void> {
        const lockPath = this.getLockFilePath(workspacePath);
        try {
            await fs.unlink(lockPath);
        } catch (e: any) {
            if (e.code !== 'ENOENT') {
                throw e;
            }
        }
    }

    /**
     * Check if the workspace is currently locked.
     */
    public static async isLocked(workspacePath: string): Promise<boolean> {
        const lockPath = this.getLockFilePath(workspacePath);
        try {
            const stats = await fs.stat(lockPath);
            if (Date.now() - stats.mtimeMs > 120_000) {
                // Stale lock
                await fs.unlink(lockPath).catch(() => {});
                return false;
            }
            return true;
        } catch (e: any) {
            return false;
        }
    }
}
