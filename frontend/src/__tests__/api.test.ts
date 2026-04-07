// Mock axios before any imports to avoid ESM parse errors
jest.mock('axios', () => {
  const mockAxios = {
    create: jest.fn(() => mockAxios),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  };
  return { default: mockAxios, ...mockAxios };
});

describe('api module', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('authApi exposes me, registerTenant, acceptInvite', () => {
    const { authApi } = require('../lib/api');
    expect(typeof authApi.me).toBe('function');
    expect(typeof authApi.registerTenant).toBe('function');
    expect(typeof authApi.acceptInvite).toBe('function');
  });

  it('projectsApi exposes list, get, create, update', () => {
    const { projectsApi } = require('../lib/api');
    expect(typeof projectsApi.list).toBe('function');
    expect(typeof projectsApi.get).toBe('function');
    expect(typeof projectsApi.create).toBe('function');
    expect(typeof projectsApi.update).toBe('function');
  });

  it('actionsApi exposes list, create, update, updateStatus', () => {
    const { actionsApi } = require('../lib/api');
    expect(typeof actionsApi.list).toBe('function');
    expect(typeof actionsApi.create).toBe('function');
  });

  it('blockersApi exposes list, create, resolve', () => {
    const { blockersApi } = require('../lib/api');
    expect(typeof blockersApi.list).toBe('function');
    expect(typeof blockersApi.create).toBe('function');
  });
});
