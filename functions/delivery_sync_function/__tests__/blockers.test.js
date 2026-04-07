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

describe('GET /api/blockers', () => {
  afterEach(resetDs);

  it('returns 200 with empty blockers list', async () => {
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp).get('/api/blockers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.blockers)).toBe(true);
    expect(res.body.data.blockers).toHaveLength(0);
  });

  it('returns blockers from findWhere', async () => {
    const fakeBlockers = [
      {
        ROWID: 1, title: 'DB issue', severity: 'HIGH', status: 'OPEN',
        project_id: 5, tenant_id: 10, raised_date: '2026-04-01',
        owner_user_id: '2', raised_by: '1', description: '', resolution: null,
        resolved_date: null, escalated_to: null,
      },
    ];
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findWhere: jest.fn().mockResolvedValue(fakeBlockers),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp).get('/api/blockers?projectId=5');
    expect(res.status).toBe(200);
    expect(res.body.data.blockers).toHaveLength(1);
    expect(res.body.data.blockers[0].title).toBe('DB issue');
  });
});

describe('POST /api/blockers', () => {
  afterEach(resetDs);

  it('returns 400 when required fields are missing', async () => {
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    // Missing title, severity, owner_user_id
    const res = await request(wrappedApp)
      .post('/api/blockers')
      .send({ project_id: '5' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when project does not exist', async () => {
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp)
      .post('/api/blockers')
      .send({ project_id: '999', title: 'Missing DB', severity: 'HIGH', owner_user_id: '2' });

    expect(res.status).toBe(404);
  });

  it('creates a blocker and returns 201', async () => {
    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({ ROWID: 5, name: 'Proj Alpha', tenant_id: 10 }),
      findWhere: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue({ ROWID: 42 }),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp)
      .post('/api/blockers')
      .send({ project_id: '5', title: 'API is down', severity: 'CRITICAL', owner_user_id: '2' });

    expect(res.status).toBe(201);
    expect(res.body.data.blocker.id).toBe('42');
    expect(res.body.data.blocker.title).toBe('API is down');
    expect(res.body.data.blocker.status).toBe('OPEN');
  });
});
