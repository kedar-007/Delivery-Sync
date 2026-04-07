'use strict';

const request = require('supertest');

jest.mock('zcatalyst-sdk-node', () => ({ initialize: jest.fn(() => null) }));

// ── DataStoreService mock (must expose static .escape) ────────────────────────
jest.mock('../src/services/DataStoreService', () => {
  const MockDS = jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    findById: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  }));
  MockDS.escape = (s) => String(s).replace(/'/g, "''");
  return MockDS;
});

const DataStoreService = require('../src/services/DataStoreService');

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockCatalystUser = (overrides = {}) => ({
  user_id: 101,
  email_id: 'user@example.com',
  first_name: 'Alice',
  last_name: 'Smith',
  role_details: { role_name: 'TEAM_MEMBER' },
  ...overrides,
});

const mockDbUser = (overrides = {}) => ({
  ROWID: 1,
  email: 'user@example.com',
  name: 'Alice Smith',
  role: 'TEAM_MEMBER',
  tenant_id: 10,
  status: 'ACTIVE',
  avatar_url: '',
  ...overrides,
});

const mockTenant = (overrides = {}) => ({
  name: 'Acme Corp',
  slug: 'acme',
  status: 'ACTIVE',
  ...overrides,
});

// Wrap the Express app to inject a controllable catalystApp per test
const express = require('express');
const app = require('../src/app');

let _mockCatalystApp = null;
const wrappedApp = express();
wrappedApp.use((req, _res, next) => {
  req.catalystApp = _mockCatalystApp;
  next();
});
wrappedApp.use(app);

const makeGetCurrentUser = (catalystUser) =>
  ({ userManagement: () => ({ getCurrentUser: jest.fn().mockResolvedValue(catalystUser) }) });

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  beforeEach(() => DataStoreService.mockClear());

  it('returns 401 when catalystApp is null', async () => {
    _mockCatalystApp = null;
    const res = await request(wrappedApp).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when Catalyst user resolution throws', async () => {
    _mockCatalystApp = {
      userManagement: () => ({
        getCurrentUser: jest.fn().mockRejectedValue(new Error('Token expired')),
      }),
    };
    const res = await request(wrappedApp).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not found in users table', async () => {
    _mockCatalystApp = makeGetCurrentUser(mockCatalystUser());

    DataStoreService.mockImplementation(() => ({
      query: jest.fn().mockResolvedValue([]),   // no user row
      findById: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp).get('/api/auth/me');
    expect(res.status).toBe(403);
    DataStoreService.mockReset();
    DataStoreService.escape = (s) => String(s).replace(/'/g, "''");
  });

  it('returns 403 when user account is INACTIVE', async () => {
    _mockCatalystApp = makeGetCurrentUser(mockCatalystUser());

    DataStoreService.mockImplementation(() => ({
      query: jest.fn()
        .mockResolvedValueOnce([mockDbUser({ status: 'INACTIVE' })])
        .mockResolvedValueOnce([mockTenant()]),
      findById: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp).get('/api/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/deactivated/i);
    DataStoreService.mockReset();
    DataStoreService.escape = (s) => String(s).replace(/'/g, "''");
  });

  it('returns 200 with user and tenantSlug for valid session', async () => {
    _mockCatalystApp = makeGetCurrentUser(mockCatalystUser());

    DataStoreService.mockImplementation(() => ({
      query: jest.fn()
        .mockResolvedValueOnce([mockDbUser()])
        .mockResolvedValueOnce([mockTenant()]),
      findById: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('user@example.com');
    expect(res.body.data.user.tenantSlug).toBe('acme');
    DataStoreService.mockReset();
    DataStoreService.escape = (s) => String(s).replace(/'/g, "''");
  });

  it('returns 403 TENANT_SUSPENDED with suspension details', async () => {
    _mockCatalystApp = makeGetCurrentUser(mockCatalystUser());

    DataStoreService.mockImplementation(() => ({
      query: jest.fn()
        .mockResolvedValueOnce([mockDbUser()])
        .mockResolvedValueOnce([mockTenant({ status: 'SUSPENDED' })])
        .mockResolvedValueOnce([{ settings: JSON.stringify({ lockInfo: { reason: 'Non-payment' } }) }]),
      findById: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp).get('/api/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_SUSPENDED');
    expect(res.body.suspension.reason).toBe('Non-payment');
    DataStoreService.mockReset();
    DataStoreService.escape = (s) => String(s).replace(/'/g, "''");
  });
});

describe('POST /api/auth/register-tenant', () => {
  it('returns 400 when tenantName is missing', async () => {
    _mockCatalystApp = makeGetCurrentUser(mockCatalystUser());

    DataStoreService.mockImplementation(() => ({
      query: jest.fn()
        .mockResolvedValueOnce([mockDbUser()])
        .mockResolvedValueOnce([mockTenant()]),
      findById: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    }));

    const res = await request(wrappedApp)
      .post('/api/auth/register-tenant')
      .send({ domain: 'acme' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    DataStoreService.mockReset();
    DataStoreService.escape = (s) => String(s).replace(/'/g, "''");
  });
});
