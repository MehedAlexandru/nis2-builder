# Phase 6 report - Scanner Agent, enrollment and diff-based rescans

> This tool supports compliance preparation and does not constitute legal advice. Scanning is
> inventory-only and requires explicit authorization for each target network.

## 1. Delivered

### Agent enrollment and lifecycle

- Organization-scoped agent list with `PENDING`, `ACTIVE` and `REVOKED` states.
- One-time enrollment token creation with a selectable validity window (15 minutes to 24 hours).
  Only a SHA-256 hash is stored; the raw token is shown once with a ready-to-run command.
- First valid heartbeat activates the agent and records `enrolledAt`, version, platform and
  `lastSeenAt`.
- Revocation invalidates the token immediately and fails queued/running scans with an explicit
  reason.
- Agent token lookup uses a dedicated RLS policy (`app.agent_token_hash`) before tenant context is
  known; every subsequent query runs with the agent's `organizationId`.

### Scan job lifecycle

- Users request a scan for an active agent against a chosen audit, with an explicit consent
  checkbox, optional CIDRs, top-port count and host rate limit.
- The agent polls `POST /api/v1/agents/heartbeat`; the API atomically claims the next queued job and
  returns its parameters.
- Stale `RUNNING` jobs (> 30 minutes) are failed on heartbeat so an agent restart does not wedge the
  queue.
- Result upload and failure reporting are authenticated with the agent token and scoped to the
  agent's organization and job.
- Audit events: `AGENT_ENROLLMENT_CREATED`, `AGENT_ENROLLED`, `AGENT_REVOKED`, `SCAN_REQUESTED`,
  `SCAN_COMPLETED`, `SCAN_FAILED`.

### Diff-based inventory

`apps/api/src/modules/agents/scan-diff.ts` compares the uploaded snapshot with the audit:

- match by normalized MAC, then by any known IP;
- **new** devices are created with `scanState=NEW`;
- **changed** devices keep manual names, notes, zones, positions and assessment answers while
  updating discovered IPs, MAC, vendor/type fallback, OS and open ports; state is `CHANGED`;
- **unchanged** devices update `lastSeenAt`; state is `UNCHANGED`;
- devices not seen are marked `MISSING`, never deleted, and keep their layout.
- The scan job stores a structured diff summary (`newDevices`, `changedDevices`, `missingDevices`,
  counts) displayed in the Agents page.
- The React Flow node and device panel surface New/Changed/Missing status.

### Scanner Agent (Go)

- TCP reachability sweep with configurable CIDRs, top-port count and hosts/second rate limit.
- Automatic `/24` selection around each active IPv4 interface when no CIDR is supplied.
- Reverse DNS lookup, Linux `/proc/net/arp` plus `arp -a` cache enrichment, MAC OUI vendor lookup,
  service labels, device-type inference and OS estimate.
- ARP neighbours in range that do not expose a probed TCP port are included as unknown devices.
- `--i-authorize-scanning` is required; a claimed job is failed if the operator did not opt in.
- `--once` processes at most one claimed job and exits; `--poll-interval` controls the loop.
- Jobs run with a 30-minute discovery timeout; failures are reported back to the API.
- No exploitation, credential attacks, inbound listeners or packet content inspection.

### API

| Method | Path                                 | Auth        | Purpose                   |
| ------ | ------------------------------------ | ----------- | ------------------------- |
| GET    | `/api/agents`                        | user        | List organization agents  |
| GET    | `/api/agents/download/:platform`     | user        | Download agent binary     |
| POST   | `/api/agents/enrollment`             | user        | Create one-time token     |
| DELETE | `/api/agents/:agentId`               | user        | Revoke agent              |
| POST   | `/api/agents/:agentId/scans`         | user        | Queue an authorized scan  |
| GET    | `/api/agents/scans`                  | user        | Scan history              |
| GET    | `/api/agents/scans/:jobId`           | user        | Scan detail/diff          |
| POST   | `/api/v1/agents/heartbeat`           | agent token | Heartbeat + claim job     |
| POST   | `/api/v1/agents/jobs/:jobId/results` | agent token | Upload inventory and diff |
| POST   | `/api/v1/agents/jobs/:jobId/fail`    | agent token | Report a failed scan      |

Agent endpoints are marked `@Public` at the JWT guard level but require a valid bearer token; CSRF
is exempt only for the `/api/v1/agents/` prefix.

### UI

- `/agents` page under **Manage → Agents**: agent cards, status, last seen, last scan, queued scans,
  token expiry, scan request and revoke actions.
- **Download agent** dialog for Linux x64/ARM64, Windows x64 and macOS Intel/Apple Silicon.
- Scan dialog with audit selector, optional CIDRs, top ports, rate limit and mandatory authorization
  consent.
- Polling scan history table and diff modal showing new/changed/missing device names and IPs.
- Network canvas shows `NEW`, `CHANGED` and `MISSING` badges and distinct border states.

### Data and infrastructure

- Migration `0007_agent_scans`:
  - `DeviceScanState` enum and `devices.scanState`;
  - `agents.enrollmentExpiresAt`, `agents.enrolledAt`, `agents.revokedAt`;
  - `scan_jobs.errorMessage`;
  - `agent_token_lookup` RLS policy.
- API image cross-compiles all five agent binaries into /opt/nis2-agent (AGENT_BINARY_DIR) and
  serves them through an authenticated,
  o-store download endpoint.
- No new npm dependencies. Go agent remains dependency-free beyond the standard library.
- Docker image guidance remains `--network host` plus `NET_RAW`/`NET_ADMIN` for raw L2 methods.

## 2. Verification

- Go: `gofmt -l .` clean, `go test ./...` passing, `go vet ./...` clean (run in
  `golang:1.27-alpine`).
- `pnpm test` - **145 passing**: shared 102, API 32 (2 diff-planner tests added), web 11.
- API: diff planner tests cover new/changed/unchanged/missing and normalized MAC matching.
- API smoke with a live agent token:
  - enrollment token created and first heartbeat activated the agent;
  - scan queued, then claimed by the next heartbeat;
  - uploaded snapshot produced `created=1`, `changed=1`, `missing=1`, `unchanged=0`;
  - map states were exactly `CHANGED`, `MISSING` and `NEW`;
  - scan history showed `COMPLETED`;
  - revoke changed the agent to `REVOKED`.
- UI smoke: `/agents` rendered, enrollment dialog generated a `nis2_agent_...` token and showed the
  run command.
- Binary downloads returned valid artifacts: ELF (Linux x64/ARM64), PE (Windows x64) and Mach-O
  (macOS Intel/Apple Silicon), 6.5-7.4 MB each.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check` are green.

## 3. Assumptions and decisions

- The enrollment token becomes the long-lived agent bearer credential after the first heartbeat.
  It is one-time in the sense that it is displayed once; revocation is the kill switch.
- HTTPS is mandatory outside localhost; the agent rejects plain HTTP to remote hosts.
- Jobs are selected per agent. An organization can run multiple agents, but only one queued/running
  job per agent is allowed at a time.
- The agent uses TCP reachability rather than ICMP for routed hosts, so it works without raw socket
  privileges. ARP cache enrichment is best-effort and only meaningful on the same L2 segment.
- Discovered devices are matched by MAC first and IP second. Manual names, notes, zones, positions
  and assessment answers always win over scan data.
- Missing devices are marked, not removed. A later scan that sees them again resets the state to
  `CHANGED` or `UNCHANGED`.
- Scan states describe the latest scan for the selected audit; they are not historical findings.
- The UI requires explicit consent; the agent additionally requires `--i-authorize-scanning`.

## 4. Known gaps

- Active raw ARP sweep and ICMP echo are not implemented; the agent uses TCP probes plus the OS ARP
  cache. Docker raw-socket guidance is documented but not exercised in automated tests.
- mDNS/NetBIOS/SNMP enrichment flags are reserved and not yet implemented. The OUI table is still a
  starter set rather than the full IEEE dataset.
- The agent sends inventory over HTTPS with a bearer token; request signing/HMAC or mTLS is future
  hardening.
- No cancellation/retry UI for queued scans; stale running jobs are failed after 30 minutes.
- No Docker-network integration test that discovers several containers automatically.
- The diff modal lists affected devices; it does not yet offer per-device accept/reject actions.
- Downloaded binaries are not code-signed or accompanied by an in-app checksum yet; build from source
  if you require provenance verification.
- Findings, audit lifecycle/close/compare and audit report export remain Phase 7.
- Legal review of Romanian template wording and DNSC channels remains outstanding.
