# Scanner Agent

> The agent performs **inventory discovery only**. It never exploits vulnerabilities or attacks
> credentials. Scanning requires explicit authorization for each target network.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Why an agent exists

A browser cannot send ARP/ICMP, and a SaaS API cannot route into a customer's private address
space. The agent runs inside the target network, initiates **outbound HTTPS only**, and never opens
an inbound port on the customer side.

## 2. Download or build

Authenticated users can download the Linux x64/ARM64, Windows x64 and macOS Intel/Apple Silicon
binaries directly from **Manage -> Agents -> Download agent**. The API image cross-compiles all five
binaries and serves them through GET /api/agents/download/:platform with
o-store headers.

For source builds:

`ash
cd apps/scanner-agent
make build
make cross
`

## 3. Deployment modes

| Mode                   | Use                             | Requirements                                                         |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Static binary          | Windows/Linux/macOS workstation | Network access to the LAN; no admin rights for TCP discovery         |
| Docker (Linux)         | Server/VM inside the network    | `--network host`; add `NET_RAW`/`NET_ADMIN` for future raw methods   |
| Docker (macOS/Windows) | Limited                         | Host networking behaves differently; prefer the binary or a Linux VM |

```bash
docker run --rm --network host \
  ghcr.io/<org>/nis2-scanner-agent:latest \
  --server https://app.example.com \
  --enrollment-token "<token>" \
  --i-authorize-scanning
```

The agent heartbeat is enough to activate it. A scan is queued from **Manage → Agents** in the UI
and claimed on the next heartbeat.

## 4. Enrollment and identity

1. A user creates a one-time enrollment token in the UI with a validity window.
2. The raw token is shown once; only its SHA-256 hash is stored in `agents.tokenHash`.
3. The first heartbeat activates `PENDING` agents and records version, platform and `lastSeenAt`.
4. The token is used as a bearer credential for heartbeats, job claims and result uploads.
5. Revoking the agent invalidates the credential immediately and fails outstanding scans.

The agent credential is scoped to one organization. The API uses an `app.agent_token_hash` RLS
lookup before setting tenant context; all scan writes then run under the normal tenant isolation
policy. HTTPS is mandatory except for localhost development.

## 5. Discovery pipeline

1. Target CIDRs: explicit job/UI CIDRs, otherwise a bounded `/24` around each active IPv4 interface.
2. Rate-limited TCP reachability probes on the top ports (default 100, configurable).
3. Reverse DNS lookup for discovered addresses.
4. OS ARP-cache enrichment on Linux (`/proc/net/arp`) and via `arp -a`; ARP-cache neighbours in
   range are included even when no probed port is open.
5. MAC OUI vendor lookup (starter table; full IEEE dataset is a later data update).
6. Service labels, device-type inference and an OS estimate from ports/vendor.

### MAC visibility limitation

MAC addresses are only visible on the same L2 segment. Devices behind a router show the router's MAC
or none. The UI states this explicitly and never claims vendor attribution for routed devices.

### Current limitations

- Active raw ARP sweep and ICMP echo are not implemented; TCP probes plus the OS ARP cache are used.
- mDNS/NetBIOS/SNMP enrichment flags are reserved but not active.
- Vulnerability discovery and exploitation are permanent non-goals.

## 6. Safety and consent

- Every scan requires the UI consent checkbox and the agent `--i-authorize-scanning` flag.
- Defaults are rate-limited and non-intrusive; each host probe uses a short TCP timeout.
- Every scan request, completion and failure is written to the append-only audit log.
- No vulnerability exploitation, password spraying, destructive probes or packet capture.
- Results are inventory metadata only; no credentials are collected.

## 7. Results and diff-based rescans

- The agent uploads a JSON snapshot to
  `POST /api/v1/agents/jobs/:jobId/results`.
- The API matches devices by normalized MAC first, then by any known IP.
- **New** devices are created with `scanState=NEW`.
- **Changed** devices update discovered fields and are marked `CHANGED`; manual names, notes,
  positions, zones and assessment answers are preserved.
- **Unchanged** devices refresh `lastSeenAt`.
- **Missing** devices are marked `MISSING`, never deleted.
- The job result stores the diff summary; the Agents page shows the affected device lists and the
  canvas shows New/Changed/Missing badges.

## 8. Fallbacks

- **Nmap XML** import.
- **CSV** import (template provided in the UI).
- **Manual** device creation from the palette.
- Imports never execute XML/CSV content; they only parse data.

## 9. CLI reference

| Flag                     | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `--server`               | Platform base URL, also `NIS2_SERVER`                          |
| `--enrollment-token`     | One-time token, also `NIS2_ENROLLMENT_TOKEN`                   |
| `--i-authorize-scanning` | Required before a claimed job is executed                      |
| `--once`                 | Send one heartbeat, process one claimed job, then exit         |
| `--poll-interval`        | Heartbeat interval (default 15 seconds)                        |
| `--dry-run`              | Print configuration and discovery capabilities without packets |
| `--timeout`              | HTTP timeout (default 30 seconds)                              |
| `--version`              | Print build version                                            |

## 10. Build and test

```bash
cd apps/scanner-agent
make build
make test
make cross
```

The agent is a static Go binary and the Docker image is distroless/non-root. Job discovery uses a
30-minute timeout; failures are reported with `POST /api/v1/agents/jobs/:jobId/fail`.

## 11. Non-goals

- Vulnerability scanning/exploitation.
- Credential attacks.
- Packet capture or content inspection.
- Inbound listeners.
- Scanning networks the customer does not own or control.
