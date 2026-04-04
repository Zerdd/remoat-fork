import { CdpService } from '../services/cdpService';
import { CdpBridge } from '../services/cdpBridgeManager';
import { ModeService } from '../services/modeService';
import { ModelService } from '../services/modelService';
import { ChatSessionService } from '../services/chatSessionService';
import { PromptDispatcher } from '../services/promptDispatcher';
import { WorkspaceService } from '../services/workspaceService';
import { ChatSessionRepository } from '../database/chatSessionRepository';
import { WorkspaceBindingRepository } from '../database/workspaceBindingRepository';
import { RESPONSE_SELECTORS } from '../services/responseMonitor';
import { logger } from '../utils/logger';
import { TelegramChannel } from '../services/cdpBridgeManager';

export interface AgCommandResult<T = any> {
    ok: boolean;
    status: string;
    summary: string;
    chatId?: string;
    error?: string;
    data?: T;
}

export class AgController {
    constructor(
        private bridge: CdpBridge,
        private modeService: ModeService,
        private modelService: ModelService,
        private chatSessionService: ChatSessionService,
        private promptDispatcher: PromptDispatcher,
        private chatSessionRepo: ChatSessionRepository,
    ) {}

    /**
     * Start a new chat session for a workspace.
     */
    public async newChat(workspacePath: string, title?: string): Promise<AgCommandResult> {
        try {
            const cdp = await this.bridge.pool.getOrConnect(workspacePath);
            const chatResult = await this.chatSessionService.startNewChat(cdp);
            
            if (chatResult.ok) {
                return {
                    ok: true,
                    status: 'success',
                    summary: 'New chat started successfully.',
                };
            } else {
                return {
                    ok: false,
                    status: 'error',
                    summary: 'Could not start new chat.',
                    error: chatResult.error,
                };
            }
        } catch (e: any) {
            return {
                ok: false,
                status: 'error',
                summary: 'Exception while starting new chat.',
                error: e.message,
            };
        }
    }

    /**
     * Get chat session info.
     */
    public async getChatInfo(channelId?: string): Promise<AgCommandResult> {
        try {
            if (channelId) {
                const session = this.chatSessionRepo.findByChannelId(channelId);
                if (session) {
                    const allSessions = this.chatSessionRepo.findByCategoryId(session.categoryId);
                    return {
                        ok: true,
                        status: 'success',
                        summary: 'Retrieved chat info for channel.',
                        data: {
                            currentSession: session,
                            totalSessions: allSessions.length,
                            sessions: allSessions
                        }
                    };
                }
            }

            // Fallback to active pool
            const activeNames = this.bridge.pool.getActiveWorkspaceNames();
            const anyCdp = activeNames.length > 0 ? this.bridge.pool.getConnected(activeNames[0]) : null;
            const info = anyCdp
                ? await this.chatSessionService.getCurrentSessionInfo(anyCdp)
                : { title: '(CDP Disconnected)', hasActiveChat: false };

            return {
                ok: true,
                status: 'success',
                summary: 'Retrieved global chat info.',
                data: info
            };
        } catch (e: any) {
            return {
                ok: false,
                status: 'error',
                summary: 'Exception while retrieving chat info.',
                error: e.message,
            };
        }
    }

    /**
     * Switch current model.
     */
    public async switchModel(cdp: CdpService, modelName: string): Promise<AgCommandResult> {
        try {
            const res = await cdp.setUiModel(modelName);
            if (res.ok) {
                return {
                    ok: true,
                    status: 'success',
                    summary: `Model changed to ${res.model || modelName}.`,
                    data: { model: res.model || modelName }
                };
            } else {
                return {
                    ok: false,
                    status: 'error',
                    summary: 'Failed to change model in UI.',
                    error: res.error,
                };
            }
        } catch (e: any) {
            return {
                ok: false,
                status: 'error',
                summary: 'Exception while switching model.',
                error: e.message,
            };
        }
    }

    /**
     * Switch current mode.
     */
    public async switchMode(cdp: CdpService, mode: string): Promise<AgCommandResult> {
        try {
            this.modeService.setMode(mode);
            const res = await cdp.setUiMode(mode);
            if (res.ok) {
                return {
                    ok: true,
                    status: 'success',
                    summary: `Mode changed to ${mode}.`
                };
            } else {
                return {
                    ok: false,
                    status: 'error',
                    summary: 'Failed to sync mode with UI (fallback to local).',
                    error: res.error,
                };
            }
        } catch (e: any) {
            return {
                ok: false,
                status: 'error',
                summary: 'Exception while switching mode.',
                error: e.message,
            };
        }
    }

    /**
     * Send a task prompt.
     * Note: This exposes the PromptDispatcher via controller logic.
     */
    public async sendTask(
        channel: TelegramChannel,
        cdp: CdpService,
        prompt: string,
        options: any = {}
    ): Promise<AgCommandResult> {
        try {
            // Check if busy 
            if (this.promptDispatcher.isBusy(channel, cdp)) {
                return {
                    ok: false,
                    status: 'busy',
                    summary: 'Workspace is currently busy.'
                };
            }

            // We do not await this, dispatch returns void and handles error via options/logs
            this.promptDispatcher.send({
                channel,
                prompt,
                cdp,
                inboundImages: options.inboundImages || [],
                options: options.dispatchOptions || {}
            }).catch((e) => logger.error('[AgController.sendTask] dispatch failed:', e));

            return {
                ok: true,
                status: 'running',
                summary: 'Task sent to dispatcher.',
                chatId: channel.chatId.toString()
            };
        } catch (e: any) {
            return {
                ok: false,
                status: 'error',
                summary: 'Exception while sending task.',
                error: e.message,
            };
        }
    }

    /**
     * Get running status.
     */
    public async getRunStatus(channel: TelegramChannel, cdp: CdpService): Promise<AgCommandResult> {
        try {
            const isBusy = this.promptDispatcher.isBusy(channel, cdp);
            return {
                ok: true,
                status: 'success',
                summary: 'Retrieved run status.',
                data: { isBusy }
            };
        } catch (e: any) {
            return {
                ok: false,
                status: 'error',
                summary: 'Exception while retrieving run status.',
                error: e.message,
            };
        }
    }

    /**
     * Stop currently running task.
     */
    public async stopRun(cdp: CdpService): Promise<AgCommandResult> {
        try {
            const contextId = cdp.getPrimaryContextId();
            const callParams: Record<string, unknown> = { expression: RESPONSE_SELECTORS.CLICK_STOP_BUTTON, returnByValue: true, awaitPromise: false };
            if (contextId !== null) callParams.contextId = contextId;
            
            const result = await cdp.call('Runtime.evaluate', callParams);
            const value = result?.result?.value;

            if (value?.ok) {
                return {
                    ok: true,
                    status: 'success',
                    summary: 'Stop button clicked successfully.'
                };
            } else {
                return {
                    ok: false,
                    status: 'error',
                    summary: 'Could not click stop button.',
                    error: value?.error || 'Stop button not found.'
                };
            }
        } catch (e: any) {
            return {
                ok: false,
                status: 'error',
                summary: 'Exception while stopping run.',
                error: e.message,
            };
        }
    }
}
