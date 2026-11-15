# NIS2 Compass Scanner Agent

Outbound-only agent that discovers the customer's local network and uploads inventory to the platform.

## Status

**Phase 6:** enrollment heartbeat, queued job claim, TCP discovery, reverse DNS, ARP-cache enrichment, MAC OUI vendor lookup, service/type/OS heuristics, JSON result upload and failure reporting. Discovery is inventory-only.

## Why an agent?

A web application cannot see a customer's LAN: browsers cannot send ARP/ICMP, and a cloud service cannot route into private address space. The agent runs inside the target network, initiates outbound HTTPS only, and never opens inbound ports.

## Safety contract

- Discovery and inventory only - **no vulnerability exploitation, credential attacks or intrusive probes**.
- Scanning is opt-in, rate-limited and requires an explicit authorization flag.
- The platform records every scan request, completion and failure in the append-only audit log.
- MAC addresses are only visible on the same L2 segment. Devices behind a router show the router's MAC or none; the UI states this limitation.
- Active raw ARP sweep, ICMP echo and mDNS/NetBIOS/SNMP enrichment are future work; the current agent uses TCP reachability plus the OS ARP cache.

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

# one heartbeat, process one claimed scan if present, then exit
./bin/nis2-scanner-agent \
  --server https://app.example.com \
  --enrollment-token "<token>" \
  --i-authorize-scanning \
  --once

# keep polling for jobs (default every 15 seconds)
./bin/nis2-scanner-agent \
  --server https://app.example.com \
  --enrollment-token "<token>" \
  --i-authorize-scanning
```

Environment alternatives: `NIS2_SERVER`, `NIS2_ENROLLMENT_TOKEN`.

Create the token in **Manage -> Agents**. The UI shows the exact command. Leave CIDRs empty in the scan dialog to let the agent choose a `/24` around each active IPv4 interface.

## Container guidance

Use `--network host` on Linux for L2 visibility. Add `NET_RAW`/`NET_ADMIN` only if future raw-socket discovery requires it; the current TCP sweep does not.

```bash
docker run --rm --network host \
  --cap-add NET_RAW --cap-add NET_ADMIN \
  nis2-scanner-agent \
  --server https://app.example.com \
  --enrollment-token "<token>" \
  --i-authorize-scanning
```
