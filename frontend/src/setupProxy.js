const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // Proxy Catalyst auth and API routes to the local Catalyst server
  app.use(
    ['/__catalyst', '/server'],
    createProxyMiddleware({
      target: 'http://localhost:9000',
      changeOrigin: true,
    })
  );
};
