// jest.mock is hoisted before imports — avoid JSX in factory (React not in scope yet)
jest.mock('./lib/api', () => ({ authApi: { me: jest.fn() } }));
jest.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: any }) =>
    require('react').createElement(require('react').Fragment, null, children),
  useAuth: () => ({ user: null, loading: false, isLoggedOut: false }),
}));

import React from 'react';

describe('App module', () => {
  it('exports a default function component', () => {
    const App = require('./App').default;
    expect(typeof App).toBe('function');
  });
});
