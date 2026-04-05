import Database from 'better-sqlite3';
import { loadConfig } from './utils/config';
import { ConfigLoader } from './utils/configLoader';
import { logger } from './utils/logger';
import type { LogLevel } from './utils/logger';
import { ModeService } from './services/modeService';
import { ModelService } from './services/modelService';
import { TemplateRepository } from './database/templateRepository';
import { WorkspaceBindingRepository } from './database/workspaceBindingRepository';
import { ChatSessionRepository } from './database/chatSessionRepository';
import { WorkspaceService } from './services/workspaceService';
import { ensureAntigravityRunning } from './services/antigravityLauncher';
import { initCdpBridge, TelegramChannel } from './services/cdpBridgeManager';
import { ChatSessionService } from './services/chatSessionService';
import { TitleGeneratorService } from './services/titleGeneratorService';
import { PromptDispatcher } from './services/promptDispatcher';
import { AgController } from './controller/agController';

export interface AppServices {
    config: ReturnType<typeof loadConfig>;
    db: Database.Database;
    modeService: ModeService;
    modelService: ModelService;
    templateRepo: TemplateRepository;
    workspaceBindingRepo: WorkspaceBindingRepository;
    chatSessionRepo: ChatSessionRepository;
    workspaceService: WorkspaceService;
    bridge: ReturnType<typeof initCdpBridge>;
    chatSessionService: ChatSessionService;
    titleGenerator: TitleGeneratorService;
    promptDispatcher: PromptDispatcher;
    agController: AgController;
}

export async function initAppServices(
    cliLogLevel: LogLevel | undefined,
    sendPromptImpl: any,
    onTaskComplete?: (channel: TelegramChannel, wsKey: string) => void
): Promise<AppServices> {
    const config = loadConfig();
    if (cliLogLevel) {
        logger.setLogLevel(cliLogLevel);
    } else {
        logger.setLogLevel(config.logLevel);
    }

    const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : ConfigLoader.getDefaultDbPath();
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    const modeService = new ModeService();
    const modelService = new ModelService();
    const templateRepo = new TemplateRepository(db);
    const workspaceBindingRepo = new WorkspaceBindingRepository(db);
    const chatSessionRepo = new ChatSessionRepository(db);
    const workspaceService = new WorkspaceService(config.workspaceBaseDir);

    await ensureAntigravityRunning();

    const bridge = initCdpBridge(config.autoApproveFileEdits);
    bridge.botToken = config.telegramBotToken;

    const chatSessionService = new ChatSessionService();
    const titleGenerator = new TitleGeneratorService();

    const finalOnTaskComplete = onTaskComplete || (() => {});
    
    // Defer agController assignment to access in closure
    let agControllerRef: AgController | undefined;

    const promptDispatcher = new PromptDispatcher({
        bridge,
        modeService,
        modelService,
        sendPromptImpl,
        onTaskComplete: (channel, wsKey) => {
            // The closure captures the external onTaskComplete
            // but also allows executing callback from bot
            finalOnTaskComplete(channel, wsKey);
        },
    });

    const agController = new AgController(bridge, modeService, modelService, chatSessionService, promptDispatcher, chatSessionRepo);
    agControllerRef = agController;

    return {
        config,
        db,
        modeService,
        modelService,
        templateRepo,
        workspaceBindingRepo,
        chatSessionRepo,
        workspaceService,
        bridge,
        chatSessionService,
        titleGenerator,
        promptDispatcher,
        agController
    };
}
