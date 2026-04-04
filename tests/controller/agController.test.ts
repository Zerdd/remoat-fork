import { AgController } from '../../src/controller/agController';

// Mock dependencies
const mockBridge = {
    pool: {
        getOrConnect: jest.fn(),
        getActiveWorkspaceNames: jest.fn().mockReturnValue([]),
        getConnected: jest.fn()
    }
};

const mockModeService = {
    setMode: jest.fn(),
};

const mockModelService = {};

const mockChatSessionService = {
    startNewChat: jest.fn(),
    getCurrentSessionInfo: jest.fn(),
};

const mockPromptDispatcher = {
    isBusy: jest.fn(),
    send: jest.fn().mockResolvedValue(true)
};

const mockChatSessionRepo = {
    findByChannelId: jest.fn()
};

describe('AgController', () => {
    let controller: AgController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new AgController(
            mockBridge as any,
            mockModeService as any,
            mockModelService as any,
            mockChatSessionService as any,
            mockPromptDispatcher as any,
            mockChatSessionRepo as any
        );
    });

    test('newChat should start a new chat successfully', async () => {
        const mockCdp = {};
        mockBridge.pool.getOrConnect.mockResolvedValueOnce(mockCdp);
        mockChatSessionService.startNewChat.mockResolvedValueOnce({ ok: true });

        const result = await controller.newChat('/fake/workspace');

        expect(result.ok).toBe(true);
        expect(result.status).toBe('success');
        expect(mockBridge.pool.getOrConnect).toHaveBeenCalledWith('/fake/workspace');
        expect(mockChatSessionService.startNewChat).toHaveBeenCalledWith(mockCdp);
    });

    test('newChat should return error if startNewChat fails', async () => {
        const mockCdp = {};
        mockBridge.pool.getOrConnect.mockResolvedValueOnce(mockCdp);
        mockChatSessionService.startNewChat.mockResolvedValueOnce({ ok: false, error: 'Fail' });

        const result = await controller.newChat('/fake/workspace');

        expect(result.ok).toBe(false);
        expect(result.error).toBe('Fail');
    });

    test('switchModel should set UI model via cdp', async () => {
        const mockCdp = { setUiModel: jest.fn().mockResolvedValue({ ok: true, model: 'GPT-4' }) };
        const result = await controller.switchModel(mockCdp as any, 'GPT-4');

        expect(result.ok).toBe(true);
        expect(mockCdp.setUiModel).toHaveBeenCalledWith('GPT-4');
        expect(result.data?.model).toBe('GPT-4');
    });

    test('sendTask should return busy status when running', async () => {
        mockPromptDispatcher.isBusy.mockReturnValueOnce(true);
        const result = await controller.sendTask({} as any, {} as any, 'Hello');

        expect(result.ok).toBe(false);
        expect(result.status).toBe('busy');
        expect(mockPromptDispatcher.send).not.toHaveBeenCalled();
    });

    test('sendTask should return running status and dispatch if not busy', async () => {
        mockPromptDispatcher.isBusy.mockReturnValueOnce(false);
        const result = await controller.sendTask({ chatId: 123 } as any, {} as any, 'Hello');

        expect(result.ok).toBe(true);
        expect(result.status).toBe('running');
        expect(mockPromptDispatcher.send).toHaveBeenCalled();
    });

    test('getRunStatus should return isBusy state', async () => {
        mockPromptDispatcher.isBusy.mockReturnValueOnce(true);
        const result = await controller.getRunStatus({} as any, {} as any);

        expect(result.ok).toBe(true);
        expect(result.data?.isBusy).toBe(true);
    });
});
