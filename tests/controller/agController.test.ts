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
        mockBridge.pool.getConnected.mockReturnValueOnce(mockCdp);
        const result = await controller.switchModel('/fake/ws', 'GPT-4');

        expect(result.ok).toBe(true);
        expect(mockCdp.setUiModel).toHaveBeenCalledWith('GPT-4');
        expect(result.data?.model).toBe('GPT-4');
    });

    test('sendTask should return running status when busy', async () => {
        mockBridge.pool.getConnected.mockReturnValueOnce({});
        mockPromptDispatcher.isBusy.mockReturnValueOnce(true);
        const result = await controller.sendTask('/fake/ws', 'Hello');

        expect(result.ok).toBe(false);
        expect(result.status).toBe('running');
        expect(mockPromptDispatcher.send).not.toHaveBeenCalled();
    });

    test('sendTask should return running status and dispatch if not busy', async () => {
        mockBridge.pool.getConnected.mockReturnValueOnce({});
        mockPromptDispatcher.isBusy.mockReturnValueOnce(false);
        const result = await controller.sendTask('/fake/ws', 'Hello', { chatId: 123 });

        expect(result.ok).toBe(true);
        expect(result.status).toBe('running');
        expect(mockPromptDispatcher.send).toHaveBeenCalled();
    });

    test('getRunStatus should return running state when busy', async () => {
        mockBridge.pool.getConnected.mockReturnValueOnce({});
        mockPromptDispatcher.isBusy.mockReturnValueOnce(true);
        const result = await controller.getRunStatus('/fake/ws');

        expect(result.ok).toBe(true);
        expect(result.status).toBe('running');
    });

    test('stopRun should invoke CDP runtime injection', async () => {
        const mockCdp = {
            getPrimaryContextId: jest.fn().mockReturnValue(1),
            call: jest.fn().mockResolvedValue({ result: { value: { ok: true } } })
        };
        mockBridge.pool.getConnected.mockReturnValueOnce(mockCdp);

        const result = await controller.stopRun('/fake/ws');
        expect(result.ok).toBe(true);
        expect(mockCdp.call).toHaveBeenCalledWith('Runtime.evaluate', expect.any(Object));
    });
});
