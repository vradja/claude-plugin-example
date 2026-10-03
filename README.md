# claude-plugin-example

A small demo component: the kind of "plugin" an AI coding agent might check
out and run. Lab-only, synthetic data, private lab receiver.

## The branch IS the scenario

Checking out a branch runs that scenario (via the tracked post-checkout hook):

| Branch | Scenario | What the component does | Reads a file? | Expected verdict |
|---|---|---|---|---|
| `main` | S1 liveness ping | bare TCP ping to the receiver, right after the agent's turn | no | **OK** (benign) |
| `s2-narrative` | S2 delayed ping | same ping, ~10s after the agent's turn | no | **Unsure** (flagged for review) |
| `s3-malicious` | S3 immediate exfil | read the watched file, encrypt, send right after the agent's turn | yes | **Unexplained** (endpoint lineage overrides the timing lane) |
| `s4-malicious` | S4 delayed exfil | same chain, sends ~30s after the agent's turn | yes | **Unexplained** (timing and lineage agree) |

## Running a scenario

```bash
git clone https://github.com/vradja/claude-plugin-example.git
cd claude-plugin-example
scripts/setup.sh s3-malicious     # arms the tracked hook + checks the branch out
```

or by hand:

```bash
git config core.hooksPath .githooks   # a fresh clone fires nothing until this
git checkout s3-malicious             # the checkout itself fires the scenario
```

`scripts/reset-scenario.sh` gives a clean slate between scenarios. Skip the
hook during development with `PLUGIN_SKIP_HOOK=1`.

## What fires

The post-checkout hook (`.githooks/post-checkout`, python-only, no package
installs) runs `plugin.py` from the checked-out branch. When an AI agent does
the checkout as a tool call, the component returns immediately so the agent's
turn can finish, then fires the moment the agent process exits - so its
network action lands relative to the AI call (inside or past the follow-up
window, per scenario). Manual checkouts run inline.

## Wire protocol

- **Pings (S1/S2)**: one TCP connection to the receiver, payload `ping\n`.
  No file read, no lineage.
- **Exfil (S3/S4)**: read the watched file -> copy to `~/plugin-demo/data/collected.dat`
  -> XOR with a SHA-256 keystream (`sha256(key + counter_be32)`, shared demo key)
  -> base64 into `payload.b64` -> POST the base64 bytes as the request body to the
  receiver's `/collection` with `X-Alibi-Enc: demo-xor`. The receiver decrypts
  only to display; the detector never decrypts anything.

## Environment knobs (all optional)

`PLUGIN_EXT_HOST`/`PLUGIN_EXT_PORT` (ping target), `PLUGIN_EXT_URL` (exfil
target), `PLUGIN_DEMO_KEY` (shared with the receiver), `PLUGIN_WATCHED_FILE`
(default `~/lab-files/dummy.txt`), `PLUGIN_S2_DELAY` (default 10s),
`PLUGIN_S4_DELAY` (default 30s), `PLUGIN_SKIP_HOOK`.

Scenario logs and reports land in `~/plugin-demo/logs/` (wiped by reset);
hook reports in the repo root as `post-checkout-report-*.txt` (gitignored).
