# NIS2 Compass Scanner Agent

Outbound-only agent that discovers the customer's local network and uploads inventory to the platform.

## Status

**Phase 0:** configuration validation, versioning, heartbeat client and the MAC OUI primitive. Active discovery and scan upload arrive in **Phase 6**. The binary sends no network packets beyond the optional HTTPS heartbeat.

## Why an agent?

A web application cannot see a customer's LAN: browsers cannot send ARP/ICMP, and a cloud service cannot route into private address space. The agent runs inside the target network, initiates outbound HTTPS only, and never opens inbound ports.

## Safety contract

- Discovery and inventory only — **no vulnerability exploitation, credential attacks or intrusive probes**.
- Scanning is opt-in, rate-limited and requires an explicit authorization flag.
- The platform records every scan in the append-only audit log.
- MAC addresses are only visible on the same L2 segment. Devices behind a router show the router's MAC or none; the UI states this limitation.

## Build

```bash
cd apps/scanner-agent
make build          # bin/nis2-scanner-agent
make test
make cross          # linux/windows/darwin, amd64/arm64
```

Docker:

```bash
docker build -t nis2-scanner-agent .
docker run --rm nis2-scanner-agent --version
```

## Run

```bash
# validate configuration without sending anything
./bin/nis2-scanner-agent \
  --server https://app.example.com \
  --enrollment-token "<one-time-token>" \
  --dry-run

# single heartbeat
./bin/nis2-scanner-agent --server https://app.example.com --enrollment-token "<token>" --once
```

Environment alternatives: `NIS2_SERVER`, `NIS2_ENROLLMENT_TOKEN`.

## Phase 6 roadmap

1. ARP sweep (L2), ICMP/TCP reachability on routed subnets, reverse DNS.
2. mDNS/NetBIOS/SNMP (v2c/v3 with supplied credentials) for names; OUI vendor lookup.
3. Optional top-100 TCP fingerprint and OS guess.
4. JSON upload with idempotency key; diff-based merge into the existing map.
5. Container guidance: `--network host` plus `NET_RAW`/`NET_ADMIN`.
