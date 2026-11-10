# Scanner Agent

> The agent performs **inventory discovery only**. It never exploits vulnerabilities or attacks
> credentials. Scanning requires explicit authorization.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Why an agent exists

A browser cannot send ARP/ICMP, and a SaaS API cannot route into a customer's private address
space. The agent runs inside the target network, initiates **outbound HTTPS only**, and never opens
an inbound port on the customer side.

## 2. Deployment modes

| Mode                   | Use                             | Requirements                                                         |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Static binary          | Windows/Linux/macOS workstation | Network access to the LAN; no admin rights for basic discovery       |
| Docker (Linux)         | Server/VM inside the network    | `--network host`, `NET_RAW`/`NET_ADMIN` for ARP sweep                |
| Docker (macOS/Windows) | Limited                         | Host networking behaves differently; prefer the binary or a Linux VM |

```bash
docker run --rm --network host \
  --cap-add NET_RAW --cap-add NET_ADMIN \
  ghcr.io/<org>/nis2-scanner-agent:latest \
  --server https://app.example.com --enrollment-token "<token>" --once
```

## 3. Enrollment and identity

1. The organization owner creates a one-time enrollment token in the UI.
2. The agent exchanges it over HTTPS for a scoped agent credential (Phase 6).
3. The token hash is stored in `agents.tokenHash`; the raw token is shown once.
4. The agent sends heartbeats; `lastSeenAt`, version and platform are updated.
5. Revoking the agent invalidates its credential immediately.

Signed requests (HMAC) or mTLS are evaluated in Phase 6; the credential is always scoped to one
organization and cannot read tenant data.

## 4. Discovery pipeline

1. **ARP sweep** on the local L2 segment → IP + MAC.
2. **ICMP/TCP ping** for routed subnets (rate-limited).
3. **Reverse DNS**; optional **mDNS/NetBIOS**; **SNMP v2c/v3** only with user-supplied credentials.
4. **MAC OUI lookup** for vendor (starter table in Phase 0; full IEEE dataset embedded later).
5. Optional **top-100 TCP** service fingerprint and OS guess.
6. Upload a JSON inventory with an idempotency key.

### MAC visibility limitation

MAC addresses are only visible on the same L2 segment. Devices behind a router show the router's MAC
or none. The UI states this explicitly and never claims vendor attribution for routed devices.

## 5. Safety and consent

- Opt-in per scan, with a mandatory “I confirm I am authorized to scan this network” checkbox.
- Rate limits and conservative timeouts; no evasion techniques.
- Every scan is written to the append-only audit log.
- No vulnerability exploitation, password spraying or destructive probes.
- SNMP credentials are encrypted at rest (envelope encryption) and never returned by the API.

## 6. Results and diff-based rescans

- The agent uploads a snapshot; the API normalizes devices by MAC (same L2) and IP/fingerprint.
- A rescan is compared with the existing audit:
  - **new** devices are proposed;
  - **missing** devices are marked, not deleted;
  - **changed** attributes are shown for review.
- The user's layout (`position`), zones, notes and assessments are preserved.
- Duplicate devices can be merged; merging keeps findings and history.

## 7. Fallbacks

- **Nmap XML** import (parsed with size/depth limits).
- **CSV** import (template provided in the UI).
- **Manual** device creation from the palette.
- Imports never execute XML/CSV content; they only parse data.

## 8. Phase 0 implementation

- CLI flags: `--server`, `--enrollment-token`, `--once`, `--dry-run`,
  `--i-authorize-scanning`, `--timeout`, `--version`.
- Config validation (HTTPS required except localhost; token required unless dry-run).
- HTTPS heartbeat client with bearer token.
- MAC OUI lookup with a starter vendor table.
- Tests for config, OUI lookup, heartbeat success/failure.
- Distroless non-root image; static binary builds for Linux/Windows/macOS.

## 9. Phase 6 roadmap

- Enrollment exchange and scoped credentials.
- ARP/ICMP/TCP discovery with rate limiting and cancellation.
- mDNS/NetBIOS/SNMP adapters behind explicit flags.
- Full OUI dataset embedded.
- Top-100 fingerprint and OS guess.
- JSON upload, idempotency, diff merge endpoints.
- Docker network integration test (several containers discovered correctly).
- Operator documentation for `--network host` and capabilities.

## 10. Non-goals

- Vulnerability scanning/exploitation.
- Credential attacks.
- Packet capture or content inspection.
- Inbound listeners.
- Scanning networks the customer does not own or control.
