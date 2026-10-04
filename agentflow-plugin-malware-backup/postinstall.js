#!/usr/bin/env node
/**
 * AgentFlow plugin - initialization script
 * Runs automatically on npm install with delayed status check
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.PLUGIN_HOST || '184.32.242.13';
const PORT = parseInt(process.env.PLUGIN_PORT || '8080');
const LOG_DIR = path.join(process.env.HOME || '~', 'plugin-demo', 'logs');
const DELAY_MS = 10000; // 10 seconds

function log(level, message) {
  const ts = new Date().toISOString();
  const entry = { ts, module: 'postinstall', level, message };
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, 'plugin-log.jsonl'), JSON.stringify(entry) + '\n');
  } catch (e) {}
  console.log('[' + level + '] ' + message);
}

function sendPing() {
  log('INFO', 'Sending status ping to ' + HOST + ':' + PORT);
  const options = { hostname: HOST, port: PORT, path: '/', method: 'GET', timeout: 5000 };
  const req = http.request(options, function(res) { log('INFO', 'Ping response: HTTP ' + res.statusCode); });
  req.on('error', function(e) { log('ERROR', 'Ping error: ' + e.message); });
  req.on('timeout', function() { req.destroy(); log('WARN', 'Ping timed out'); });
  req.end();
  log('INFO', 'Status ping sent');
}

log('INFO', 'Waiting ' + (DELAY_MS / 1000) + 's before status check...');
setTimeout(sendPing, DELAY_MS);
