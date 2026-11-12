# Phase 5 report - network mapper and device inventory

> This tool supports compliance preparation and does not constitute legal advice. The Romanian
> templates remain `pending-legal-review`; confirm DNSC registration and reporting channels before
> use.

## 1. Delivered

### Dated audit snapshots

- Organization-scoped audit list, creation and metadata editing with period, scope, methodology,
  auditor and limitations.
- New audits receive five editable zones: LAN, DMZ, Guest, Server VLAN and Cloud.
- The seed adds a `Demo network baseline` audit with nine devices, five zones and eight connections
  so the mapper is explorable immediately. Re-seeding never overwrites user layout or assessments.

### Shared network contracts and completeness engine

`packages/shared/src/schemas/network.ts` defines the API/web contracts for audits, devices,
assessments, zones, connections, layout, imports, merge and duplicate groups.

`packages/shared/src/network/completeness.ts` provides:

- type-specific required fields (a printer does not need a backup; a server does);
- weighted/required completion percentage;
- missing-required-field list used to disable "Information complete";
- risk indicators for expired or missing AV/EDR, EOL OS, stale patching, missing or untested
  backups, remote access without MFA, default credentials, internet exposure, missing logging,
  missing disk encryption and licences expiring within 30 days;
- licence expiry states `EXPIRED`, `DUE_7`, `DUE_30`, `OK`.

The API recomputes completeness on every identity/assessment save. The UI also computes it live so
the checkbox and badges update before saving.

### Network canvas

- React Flow canvas with type-specific icons, name, first IP and MAC on each node.
- Drag devices, draw connections from handles, snap-to-grid, zoom/pan, minimap, controls and auto-fit
  on audit change.
- Connections carry wired/wireless/VPN type, speed and VLAN; clicking an edge opens the property
  dialog for edit/delete.
- Five coloured zone containers. Dragging a zone moves its assigned devices; dragging a device into
  a zone assigns it. Zone bounds and device positions persist via `PUT /audits/:id/layout`.
- Zone dialog: add, rename, recolour, describe and delete zones. Deleting a zone leaves its devices
  in place and clears their zone assignment.
- Zones are resizable from every edge and corner with `NodeResizer`; new bounds persist
  automatically.
- Layout undo/redo, PNG export of the current canvas, and a visible device count.
- Green check badge when information is complete and risk-free, amber warning when complete data
  still exposes a risk, and a percentage badge while incomplete.

### Device detail panel

Tabs cover identity, software, endpoint protection, access control, backup/recovery, network,
data protection, logging and physical security. The panel includes:

- all identity fields, multiple IPs, MAC, criticality, owner, business services and notes;
- per-device assessment fields with yes/no/not-set controls, dates, numbers, multi-select remote
  access and backup locations;
- live completeness, missing required fields and risk indicators;
- licence/EOL warning styling;
- delete with confirmation and a deferred-attachment notice.

The "Add finding for this device" action remains Phase 7 work; the panel does not create findings yet.

### Imports and duplicate handling

- Nmap XML import: uptime filter, IPv4/IPv6, MAC/vendor, hostname, open ports/services and OS guess.
- CSV import: quoted fields, header aliases, IP lists, MAC normalization, device-type aliases and a
  downloadable template at `GET /api/audits/import-template.csv`.
- Imports match existing devices by MAC or any IP and fill missing discovery fields without
  overwriting manual names, notes, positions or assessment answers.
- Duplicate detection groups devices by MAC and IP. Merge moves connections/finding links to the
  chosen target, combines IPs/services/notes and deletes the source.
- Files are sent as JSON text (2.5 MB maximum); nothing is executed or written to disk.

### API

| Method | Path                                          | Purpose                          |
| ------ | --------------------------------------------- | -------------------------------- |
| GET    | `/api/audits`                                 | List dated audits                |
| POST   | `/api/audits`                                 | Create an audit + default zones  |
| GET    | `/api/audits/import-template.csv`             | Download CSV import template     |
| GET    | `/api/audits/:auditId`                        | Full network map                 |
| PATCH  | `/api/audits/:auditId`                        | Update audit metadata/status     |
| GET    | `/api/audits/:auditId/duplicates`             | MAC/IP duplicate groups          |
| POST   | `/api/audits/:auditId/devices`                | Add a manual device              |
| PATCH  | `/api/audits/:auditId/devices/:deviceId`      | Update identity/layout           |
| DELETE | `/api/audits/:auditId/devices/:deviceId`      | Delete device                    |
| PUT    | `/api/audits/:auditId/devices/:id/assessment` | Save posture, enforce completion |
| POST   | `/api/audits/:auditId/import`                 | Import Nmap XML or CSV           |
| POST   | `/api/audits/:auditId/merge`                  | Merge duplicate devices          |
| PUT    | `/api/audits/:auditId/layout`                 | Persist device/zone positions    |
| POST   | `/api/audits/:auditId/zones`                  | Create a zone                    |
| PATCH  | `/api/audits/:auditId/zones/:zoneId`          | Update a zone                    |
| DELETE | `/api/audits/:auditId/zones/:zoneId`          | Delete a zone                    |
| POST   | `/api/audits/:auditId/connections`            | Create a connection              |
| PATCH  | `/api/audits/:auditId/connections/:id`        | Update connection properties     |
| DELETE | `/api/audits/:auditId/connections/:id`        | Delete a connection              |

New audit actions: `NETWORK_AUDIT_CREATED`, `NETWORK_AUDIT_UPDATED`, `DEVICE_CREATED`,
`DEVICE_UPDATED`, `DEVICE_DELETED`, `DEVICE_ASSESSMENT_SAVED`, `NETWORK_IMPORT_COMPLETED`,
`DEVICES_MERGED`, `NETWORK_LAYOUT_SAVED`, `ZONE_CREATED`, `ZONE_UPDATED`, `ZONE_DELETED`,
`CONNECTION_CREATED`, `CONNECTION_UPDATED`, `CONNECTION_DELETED`.

### Data and dependencies

- **No migration required:** the Phase 0 data model already contains `audits`, `devices`,
  `device_assessments`, `zones`, `connections` and `findings` links. Phase 5 uses the existing RLS
  policies.
- Added `fast-xml-parser` to the API for Nmap XML parsing.
- Added `html-to-image` to the web app for canvas PNG export.
- Demo seed now creates the network baseline described above.

## 2. Verification

- `pnpm lint` - 3/3 packages.
- `pnpm typecheck` - 4/4 tasks.
- `pnpm test` - **143 passing**: shared 102 (6 completeness tests added), API 30 (3 import tests
  added), web 11.
- `pnpm build` - shared, API and web.
- `pnpm format:check` - clean.
- `pnpm openapi:generate` - audit/network endpoints published.
- Docker API smoke:
  - seeded audit: 9 devices, 5 zones, 8 connections;
  - created device: completeness 40, six required fields missing;
  - marking incomplete device complete -> `400 DEVICE_ASSESSMENT_INCOMPLETE`;
  - completed server assessment -> 100%, complete, risk `BACKUP_NOT_TESTED`;
  - duplicate MAC/IP detection and merge succeeded;
  - CSV import created 2 devices; Nmap XML import created 1 device with port/OS enrichment;
  - connection with VLAN 30 created and persisted;
  - layout move to `(42, 84)` persisted after reload; zone bounds updated;
  - zone create/update/delete round-trip preserved the zone count (5 -> 5) and cleared an updated
    description to null;
  - cleanup returned the demo audit to 9 devices and 8 connections.
- Vite dev server served `main.tsx`, `NetworkPage.tsx`, `NetworkCanvas.tsx` and `DevicePanel.tsx`
  as transformed modules with HTTP 200.

## 3. Assumptions and decisions

- Completion percentage is based on **required fields**, not optional fields. Optional answers still
  contribute to risk detection. A device can be 100% complete but amber because a risk remains.
- `device_assessments.data` stays JSONB because the posture fields are likely to evolve faster than
  the core inventory. The shared Zod schema is the contract.
- Positions and zone bounds are stored as absolute canvas coordinates. Zones are visual containers,
  not React Flow parent nodes; dragging a zone applies the delta to its assigned devices.
- Nmap device-type inference is deliberately conservative and heuristic. The user can correct the
  type in the details panel.
- Imports preserve user work: matching by MAC/IP updates only missing discovery fields. Manual
  devices are never deleted by an import.
- Undo/redo covers layout changes (device/zone positions and zone assignment). Device, connection
  and zone deletion use explicit confirmation dialogs.
- PNG export captures the current viewport, not the complete graph. Report-oriented SVG rendering is
  part of the Phase 7 audit report work.
- The seeded network is demonstration data, not a real scan; no scan was executed.

## 4. Known gaps

- Scanner Agent enrollment, push ingestion and diff-based rescans are Phase 6.
- Findings, auto-suggested findings, audit close/compare and audit report export are Phase 7.
- Devices are added with the toolbar palette, not dragged from a side palette.
- Attachment upload and malware scanning remain deferred; the panel explains this.
- No Playwright E2E or DB-backed cross-tenant integration test yet; the Phase 5 smoke uses the live
  Docker API and the unit tests cover completeness/import parsing.
- Nmap imports do not capture SNMP/NetBIOS/mDNS details or maintain a scan diff; that arrives with
  the agent.
- Legal review of Romanian template wording and DNSC channels remains outstanding.
