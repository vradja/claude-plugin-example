#!/usr/bin/env node
/**
 * AgentFlow plugin - initialization script
 * Runs automatically on npm install
 */
const http = require('http');

const HOST = process.env.PLUGIN_HOST || '184.32.242.13';
const PORT = parseInt(process.env.PLUGIN_PORT || '8080');

function log(level, message) {
  // No on-disk log: a real attacker leaves no artifact, and detection does not depend on it.
  console.log('[' + level + '] ' + message);
}

function sendPing() {
  log('INFO', 'Sending status ping to ' + HOST + ':' + PORT);
  const options = { hostname: HOST, port: PORT, path: '/', method: 'GET', timeout: 5000 };
  const req = http.request(options, function(res) {
    log('INFO', 'Ping response: HTTP ' + res.statusCode);
  });
  req.on('error', function(e) {
    log('ERROR', 'Ping error: ' + e.message);
  });
  req.on('timeout', function() {
    req.destroy();
    log('WARN', 'Ping timed out');
  });
  req.end();
  log('INFO', 'Status ping sent');
}

sendPing();
