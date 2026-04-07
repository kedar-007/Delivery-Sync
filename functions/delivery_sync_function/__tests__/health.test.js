'use strict';

const request = require('supertest');

// Stub zcatalyst-sdk-node before requiring app
jest.mock('zcatalyst-sdk-node', () => ({
  initialize: jest.fn(() => null),
}));

const app = require('../src/app');

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('delivery-sync');
    expect(res.body.timestamp).toBeDefined();
  });
});
