import { z } from 'zod';
import {
  agentStatusSchema,
  deviceScanStateSchema,
  deviceTypeSchema,
  scanJobStatusSchema,
} from '../enums';
import { isoTimestampSchema } from './common';

export const agentNameSchema = z.string().trim().min(2).max(120);

export const agentDownloadPlatformSchema = z.enum([
  'linux-amd64',
  'linux-arm64',
  'windows-amd64',
  'darwin-amd64',
  'darwin-arm64',
]);
export type AgentDownloadPlatform = z.infer<typeof agentDownloadPlatformSchema>;

export const createAgentEnrollmentSchema = z
  .object({
    name: agentNameSchema,
    expiresInMinutes: z.number().int().min(5).max(1440).default(60),
  })
  .strict();
export type CreateAgentEnrollmentInput = z.infer<typeof createAgentEnrollmentSchema>;

export const agentSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: agentStatusSchema,
  version: z.string().nullable(),
  platform: z.string().nullable(),
  lastSeenAt: isoTimestampSchema.nullable(),
  enrolledAt: isoTimestampSchema.nullable(),
  enrollmentExpiresAt: isoTimestampSchema.nullable(),
  revokedAt: isoTimestampSchema.nullable(),
  createdAt: isoTimestampSchema,
  queuedScans: z.number().int().nonnegative(),
  lastScanAt: isoTimestampSchema.nullable(),
});
export type AgentSummary = z.infer<typeof agentSummarySchema>;

export const agentEnrollmentResponseSchema = z.object({
  agent: agentSummarySchema,
  token: z.string(),
  expiresAt: isoTimestampSchema,
});
export type AgentEnrollmentResponse = z.infer<typeof agentEnrollmentResponseSchema>;

export const agentScanParamsSchema = z
  .object({
    authorized: z.literal(true),
    cidrs: z.array(z.string().trim().min(1).max(80)).max(16).default([]),
    topPorts: z.number().int().min(0).max(1000).default(100),
    enableMdns: z.boolean().default(false),
    enableNetbios: z.boolean().default(false),
    rateLimitPerSecond: z.number().int().min(1).max(500).default(20),
  })
  .strict();
export type AgentScanParams = z.infer<typeof agentScanParamsSchema>;

export const createAgentScanSchema = z
  .object({
    auditId: z.string().uuid(),
    cidrs: z.array(z.string().trim().min(1).max(80)).max(16).default([]),
    topPorts: z.number().int().min(0).max(1000).default(100),
    enableMdns: z.boolean().default(false),
    enableNetbios: z.boolean().default(false),
    rateLimitPerSecond: z.number().int().min(1).max(500).default(20),
    authorized: z.literal(true),
  })
  .strict();
export type CreateAgentScanInput = z.infer<typeof createAgentScanSchema>;

export const agentHeartbeatSchema = z
  .object({
    version: z.string().trim().max(80).optional(),
    platform: z.string().trim().max(120).optional(),
  })
  .strict();
export type AgentHeartbeatInput = z.infer<typeof agentHeartbeatSchema>;

export const agentJobSchema = z.object({
  id: z.string().uuid(),
  auditId: z.string().uuid(),
  method: z.string(),
  params: agentScanParamsSchema,
});
export type AgentJob = z.infer<typeof agentJobSchema>;

export const agentHeartbeatResponseSchema = z.object({
  agent: z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: agentStatusSchema,
  }),
  job: agentJobSchema.nullable(),
});
export type AgentHeartbeatResponse = z.infer<typeof agentHeartbeatResponseSchema>;

export const scannedDeviceSchema = z
  .object({
    ipAddresses: z.array(z.string().trim().ip()).min(1).max(16),
    macAddress: z.string().trim().max(32).optional(),
    hostname: z.string().trim().max(160).optional(),
    vendor: z.string().trim().max(160).optional(),
    deviceType: deviceTypeSchema.optional(),
    os: z.string().trim().max(160).optional(),
    openPorts: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
  })
  .strict();
export type ScannedDevice = z.infer<typeof scannedDeviceSchema>;

export const agentScanResultSchema = z
  .object({
    scannedAt: isoTimestampSchema.optional(),
    devices: z.array(scannedDeviceSchema).max(5000),
    warnings: z.array(z.string().trim().max(500)).max(50).optional(),
  })
  .strict();
export type AgentScanResult = z.infer<typeof agentScanResultSchema>;

export const agentJobFailSchema = z
  .object({
    error: z.string().trim().min(1).max(1000),
  })
  .strict();
export type AgentJobFailInput = z.infer<typeof agentJobFailSchema>;

export const scanDiffDeviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ipAddresses: z.array(z.string()),
});
export type ScanDiffDevice = z.infer<typeof scanDiffDeviceSchema>;

export const scanDiffChangedDeviceSchema = scanDiffDeviceSchema.extend({
  changes: z.array(z.string()),
});
export type ScanDiffChangedDevice = z.infer<typeof scanDiffChangedDeviceSchema>;

export const scanDiffSummarySchema = z.object({
  received: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  newDevices: z.array(scanDiffDeviceSchema),
  missingDevices: z.array(scanDiffDeviceSchema),
  changedDevices: z.array(scanDiffChangedDeviceSchema),
});
export type ScanDiffSummary = z.infer<typeof scanDiffSummarySchema>;

export const agentScanSummarySchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid().nullable(),
  agentName: z.string().nullable(),
  auditId: z.string().uuid().nullable(),
  auditName: z.string().nullable(),
  method: z.string(),
  status: scanJobStatusSchema,
  params: agentScanParamsSchema.partial().nullable(),
  createdAt: isoTimestampSchema,
  startedAt: isoTimestampSchema.nullable(),
  finishedAt: isoTimestampSchema.nullable(),
  errorMessage: z.string().nullable(),
  resultSummary: scanDiffSummarySchema.nullable(),
});
export type AgentScanSummary = z.infer<typeof agentScanSummarySchema>;

export const agentScanCreateResponseSchema = z.object({
  scan: agentScanSummarySchema,
});
export type AgentScanCreateResponse = z.infer<typeof agentScanCreateResponseSchema>;

export const agentDeviceScanStateSchema = deviceScanStateSchema;
