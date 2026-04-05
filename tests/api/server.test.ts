import express from 'express';
import request from 'supertest';
import { setupApiRoutes } from '../../src/api/routes';
import { AgController } from '../../src/controller/agController';
import { WorkspaceLock } from '../../src/utils/workspaceLock';

// Mock dependencies
jest.mock('../../src/controller/agController');
jest.mock('../../src/utils/workspaceLock');

describe('API Server Routes', () => {
    let app: express.Express;
    let mockAgController: jest.Mocked<AgController>;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        
        mockAgController = {
            newChat: jest.fn(),
            getChatInfo: jest.fn(),
            switchModel: jest.fn(),
            switchMode: jest.fn(),
            sendTask: jest.fn(),
            getRunStatus: jest.fn(),
            stopRun: jest.fn(),
        } as unknown as jest.Mocked<AgController>;

        // By default, system is not locked
        (WorkspaceLock.isLocked as jest.Mock).mockResolvedValue(false);

        setupApiRoutes(app, mockAgController);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return 400 if workspacePath is missing (query or body)', async () => {
        const response = await request(app).get('/api/chat-info');
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            ok: false,
            status: 'error',
            summary: 'Missing workspacePath in query or body'
        });
    });

    it('should return 200 and formatted result for /chat-info with workspacePath', async () => {
        mockAgController.getChatInfo.mockResolvedValue({
            ok: true,
            status: 'success',
            summary: 'Retrieved info',
            data: { title: 'Test Chat' }
        });

        const response = await request(app).get('/api/chat-info?workspacePath=/foo/bar');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            ok: true,
            status: 'success',
            summary: 'Retrieved info',
            data: { title: 'Test Chat' }
        });
        expect(mockAgController.getChatInfo).toHaveBeenCalledWith('/foo/bar');
    });

    it('should return 409 if WorkspaceLock indicates locked for write operations', async () => {
        (WorkspaceLock.isLocked as jest.Mock).mockResolvedValue(true);

        const response = await request(app)
            .post('/api/new-chat')
            .send({ workspacePath: '/foo/bar' });

        expect(response.status).toBe(409);
        expect(response.body.summary).toMatch(/Workspace is currently busy/);
        expect(mockAgController.newChat).not.toHaveBeenCalled();
    });

    it('should return 200 for /send-task', async () => {
        mockAgController.sendTask.mockResolvedValue({
            ok: true,
            status: 'running',
            summary: 'Task started'
        });

        const response = await request(app)
            .post('/api/send-task')
            .send({ workspacePath: '/foo/bar', prompt: 'test prompt' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('running');
        expect(mockAgController.sendTask).toHaveBeenCalledWith('/foo/bar', 'test prompt', {});
    });
});
