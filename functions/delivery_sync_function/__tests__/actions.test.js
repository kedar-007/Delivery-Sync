'use strict';

const request = require('supertest');

jest.mock('zcatalyst-sdk-node', () => ({ initialize: jest.fn(() => null) }));

jest.mock('../src/middleware/AuthMiddleware', () => ({
  authenticate: jest.fn((req, _res, next) => next()),
  authenticateCron: jest.fn((req, _res, next) => next()),
}));

jest.mock('../src/services/DataStoreService', () => {
  const MockDS = jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    findById: jest.fn(),
    findWhere: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  }));
  MockDS.escape = (s) => String(s).replace(/'/g, "''");
  MockDS.today = () => new Date().toISOString().slice(0, 10);
  return MockDS;
});

jest.mock('../src/services/AuditService', () =>
  jest.fn().mockImplementation(() => ({ log: jest.fn().mockResolvedValue(null) }))
);

jest.mock('../src/services/NotificationService', () =>
  jest.fn().mockImplementation(() => ({
    sendInApp: jest.fn().mockResolvedValue(null),
    sendEmail: jest.fn().mockResolvedValue(null),
    sendTaskAssignment: jest.fn().mockResolvedValue(null),
  }))
);

const DataStoreService = require('../src/services/DataStoreService');
const express = require('express');
const app = require('../src/app');

const CURRENT_USER = {
  id: '1', email: 'lead@acme.com', name: 'Lead',
  role: 'DELIVERY_LEAD', tenantId: '10',
  tenantSlug: 'acme', tenantName: 'Acme Corp',
  status: 'ACTIVE', avatarUrl: '',
};

const wrappedApp = express();
wrappedApp.use((req, _res, next) => {
  req.currentUser = CURRENT_USER;
  req.tenantId = CURRENT_USER.tenantId;
  req.catalystApp = {};
  next();
});
wrappedApp.use(app);

const resetDs = () => {
  DataStoreService.mockReset();
  DataStoreService.escape = (s) => String(s).replace(/'/g, "''");
  DataStoreService.today = () => new Date().toISOString().slice(0, 10);
};

describe('GET /api/actions', () => {
  afterEach(resetDs);

  it('returns 200 with list of actions', async () => {
    const fakeActions = [
      {
        ROWID: 1, title: 'Fix login bug', status: 'OPEN',
        project_id: 5, tenant_id: 10, action_priority: 'HIGH',
        due_date: '2026-04-15', assigned_to: '2', created_by: '1', description: '',
      },
    ];
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findWhere: jest.fn().mockResolvedValue(fakeActions),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp).get('/api/actions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.actions).toHaveLength(1);
    expect(res.body.data.actions[0].title).toBe('Fix login bug');
  });
});

describe('POST /api/actions', () => {
  afterEach(resetDs);

  it('returns 400 when required fields are missing', async () => {
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    // Missing title, owner_user_id, due_date
    const res = await request(wrappedApp)
      .post('/api/actions')
      .send({ project_id: '5' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('creates an action and returns 201', async () => {
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({ ROWID: 5, name: 'Proj Alpha', tenant_id: 10 }),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue({ ROWID: 99 }),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp)
      .post('/api/actions')
      .send({
        project_id: '5',
        title: 'Deploy hotfix to prod',
        owner_user_id: '2',
        priority: 'HIGH',
        due_date: '2026-04-10',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.action).toBeDefined();
    expect(res.body.data.action.title).toBe('Deploy hotfix to prod');
  });

  it('returns 404 when project is not found', async () => {
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp)
      .post('/api/actions')
      .send({
        project_id: '999',
        title: 'Some action',
        owner_user_id: '2',
        priority: 'MEDIUM',
        due_date: '2026-05-01',
      });

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/actions/:actionId', () => {
  afterEach(resetDs);

  it('returns 404 when action does not exist', async () => {
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp)
      .put('/api/actions/999')
      .send({ status: 'DONE' });

    expect(res.status).toBe(404);
  });

  it('updates an action and returns 200', async () => {
    const existingAction = {
      ROWID: 10, title: 'Fix bug', status: 'OPEN',
      project_id: 5, tenant_id: 10, assigned_to: '2',
      due_date: '2026-04-15', action_priority: 'HIGH',
    };

    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(existingAction),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      update: jest.fn().mockResolvedValue({ ...existingAction, status: 'DONE' }),
    }));

    const res = await request(wrappedApp)
      .put('/api/actions/10')
      .send({ status: 'DONE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
