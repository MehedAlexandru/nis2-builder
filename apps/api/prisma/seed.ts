import { hash } from '@node-rs/argon2';
import { Prisma, PrismaClient, $Enums } from '@prisma/client';
import {
  applyDocumentPrefill,
  calculateDocumentProgress,
  classificationAnswersSchema,
  classify,
  documentStatusFromProgress,
  documentTemplateSchema,
  evaluateDeviceCompleteness,
  getClassificationPack,
  getDocumentTemplate,
  getDocumentTemplates,
  type DeviceAssessmentData,
  type DeviceType,
  type DocumentPayload,
} from '@nis2/shared';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'owner@demo.local';
const DEMO_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? 'Demo!Passw0rd123';

async function main(): Promise<void> {
  const roPack = getClassificationPack('RO');
  if (!roPack) throw new Error('RO classification pack is not available');

  // The pack is versioned data. Deactivate older versions, keep them for
  // reproducibility of historical classification runs.
  await prisma.jurisdictionPack.updateMany({
    where: { code: roPack.code, version: { not: roPack.version } },
    data: { isActive: false },
  });
  await prisma.jurisdictionPack.upsert({
    where: { code_version: { code: roPack.code, version: roPack.version } },
    update: {
      name: roPack.name,
      authority: roPack.authority,
      content: roPack as unknown as Prisma.InputJsonValue,
      isActive: true,
    },
    create: {
      code: roPack.code,
      version: roPack.version,
      name: roPack.name,
      authority: roPack.authority,
      content: roPack as unknown as Prisma.InputJsonValue,
      isActive: true,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: 'demo-sme' },
    update: {},
    create: {
      name: 'Demo SME SRL',
      slug: 'demo-sme',
      countryCode: 'RO',
      jurisdictionPackCode: 'RO',
      scopeMode: 'MANDATORY',
      companyProfile: {
        create: {
          legalName: 'Demo SME SRL',
          countryCode: 'RO',
          city: 'Bucharest',
          employeeCount: 60,
          annualTurnoverEur: 12_000_000,
          balanceSheetTotalEur: 6_000_000,
        },
      },
    },
  });

  // @node-rs/argon2 defaults to Argon2id.
  const passwordHash = await hash(DEMO_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const owner = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      givenName: 'Demo',
      familyName: 'Owner',
      globalRole: 'USER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      locale: 'en',
    },
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: owner.id } },
    update: { role: 'OWNER' },
    create: { organizationId: organization.id, userId: owner.id, role: 'OWNER' },
  });

  await prisma.companyProfile.update({
    where: { organizationId: organization.id },
    data: {
      sector: 'ict_service_management',
      subsector: 'managed_services',
      employeeCount: 60,
      annualTurnoverEur: 12_000_000,
      balanceSheetTotalEur: 6_000_000,
    },
  });

  // Data-driven document templates. Older versions stay for reproducibility.
  for (const template of getDocumentTemplates()) {
    const parsed = documentTemplateSchema.parse(template);
    await prisma.documentTemplate.updateMany({
      where: { key: parsed.key, version: { not: parsed.version } },
      data: { isActive: false },
    });
    await prisma.documentTemplate.upsert({
      where: { key_version: { key: parsed.key, version: parsed.version } },
      update: {
        title: parsed.title.en,
        shortDescription: parsed.shortDescription.en,
        category: parsed.category,
        legalReference: parsed.legalReference,
        applicability: parsed.applicability,
        ownerRole: parsed.ownerRole,
        reviewFrequencyMonths: parsed.reviewFrequencyMonths,
        schema: parsed as unknown as Prisma.InputJsonValue,
        isActive: true,
        sortOrder: parsed.sortOrder,
      },
      create: {
        key: parsed.key,
        version: parsed.version,
        title: parsed.title.en,
        shortDescription: parsed.shortDescription.en,
        category: parsed.category,
        legalReference: parsed.legalReference,
        applicability: parsed.applicability,
        ownerRole: parsed.ownerRole,
        reviewFrequencyMonths: parsed.reviewFrequencyMonths,
        schema: parsed as unknown as Prisma.InputJsonValue,
        isActive: true,
        sortOrder: parsed.sortOrder,
      },
    });
  }

  // A seeded, partially completed document so the documentation centre is
  // immediately explorable. Existing user work is never overwritten.
  const demoProfile = await prisma.companyProfile.findUnique({
    where: { organizationId: organization.id },
  });
  const demoTemplate = getDocumentTemplate('governance_registration');
  if (demoTemplate && demoProfile) {
    const templateRow = await prisma.documentTemplate.findUnique({
      where: { key_version: { key: demoTemplate.key, version: demoTemplate.version } },
    });
    if (templateRow) {
      const existingDocument = await prisma.document.findUnique({
        where: {
          organizationId_templateId: {
            organizationId: organization.id,
            templateId: templateRow.id,
          },
        },
      });
      if (!existingDocument) {
        const profileData = {
          legalName: demoProfile.legalName,
          registrationNumber: demoProfile.registrationNumber,
          vatNumber: demoProfile.vatNumber,
          addressLine1: demoProfile.addressLine1,
          city: demoProfile.city,
          countryCode: demoProfile.countryCode,
          website: demoProfile.website,
          contactEmail: null,
          dpo: demoProfile.dpo,
          ciso: demoProfile.ciso,
        };
        const payload = applyDocumentPrefill(
          demoTemplate,
          {},
          profileData as Record<string, unknown>,
        );
        payload.primaryContactName = 'Demo Owner';
        payload.primaryContactEmail = DEMO_EMAIL;
        payload.registrationAuthority = 'DNSC';
        payload.services = [
          {
            service: 'Managed security services',
            description: 'Managed detection and response for SME customers',
            memberState: 'RO',
            criticality: 'High',
          },
        ];
        const nextPayload = payload as DocumentPayload;
        const progress = calculateDocumentProgress(demoTemplate, nextPayload);
        const reviewDate = new Date();
        reviewDate.setMonth(reviewDate.getMonth() + demoTemplate.reviewFrequencyMonths);
        const document = await prisma.document.create({
          data: {
            organizationId: organization.id,
            templateId: templateRow.id,
            templateVersion: demoTemplate.version,
            status: documentStatusFromProgress(progress.percentage),
            payload: nextPayload as Prisma.InputJsonValue,
            progress: progress.percentage,
            currentRevisionNo: 1,
            nextReviewDate: reviewDate,
            ownerUserId: owner.id,
            lastEditedById: owner.id,
          },
        });
        await prisma.documentRevision.create({
          data: {
            organizationId: organization.id,
            documentId: document.id,
            revisionNo: 1,
            templateVersion: demoTemplate.version,
            payload: nextPayload as Prisma.InputJsonValue,
            changedFields: { fields: Object.keys(nextPayload) } as Prisma.InputJsonValue,
            changeNote: 'Initial demo content',
            createdById: owner.id,
          },
        });
      }
    }
  }

  const riskTemplate = getDocumentTemplate('risk_management_policy');
  if (riskTemplate) {
    const templateRow = await prisma.documentTemplate.findUnique({
      where: { key_version: { key: riskTemplate.key, version: riskTemplate.version } },
    });
    if (templateRow) {
      const existingDocument = await prisma.document.findUnique({
        where: {
          organizationId_templateId: {
            organizationId: organization.id,
            templateId: templateRow.id,
          },
        },
      });
      if (!existingDocument) {
        const riskPayload = {
          methodology:
            'ISO/IEC 27005 aligned risk analysis with likelihood and impact scored from 1 to 5.',
          riskCriteria: 'Residual risk above 12 requires management approval before acceptance.',
          reviewCycle: 'Annual and after any significant change',
          riskRegister: [
            {
              asset: 'ERP',
              threat: 'Outage',
              likelihood: '4',
              impact: '4',
              treatment: 'DR site and tested backups',
              owner: 'CISO',
              dueDate: '2026-12-31',
            },
            {
              asset: 'Email',
              threat: 'Phishing',
              likelihood: '5',
              impact: '3',
              treatment: 'MFA and awareness training',
              owner: 'IT',
              dueDate: '2026-12-31',
            },
            {
              asset: 'DNS',
              threat: 'Spoofing',
              likelihood: '3',
              impact: '4',
              treatment: 'DNSSEC and registrar lock',
              owner: 'IT',
              dueDate: '2026-12-31',
            },
          ],
          residualRisk: { likelihood: 2, impact: 3 },
        };
        const progress = calculateDocumentProgress(riskTemplate, riskPayload);
        const reviewDate = new Date();
        reviewDate.setMonth(reviewDate.getMonth() + riskTemplate.reviewFrequencyMonths);
        const document = await prisma.document.create({
          data: {
            organizationId: organization.id,
            templateId: templateRow.id,
            templateVersion: riskTemplate.version,
            status: documentStatusFromProgress(progress.percentage),
            payload: riskPayload as Prisma.InputJsonValue,
            progress: progress.percentage,
            currentRevisionNo: 1,
            nextReviewDate: reviewDate,
            ownerUserId: owner.id,
            lastEditedById: owner.id,
          },
        });
        await prisma.documentRevision.create({
          data: {
            organizationId: organization.id,
            documentId: document.id,
            revisionNo: 1,
            templateVersion: riskTemplate.version,
            payload: riskPayload as Prisma.InputJsonValue,
            changedFields: { fields: Object.keys(riskPayload) } as Prisma.InputJsonValue,
            changeNote: 'Initial demo risk register',
            createdById: owner.id,
          },
        });
      }
    }
  }

  // Seed one demo classification run so the result page can be explored
  // immediately. Existing runs are never overwritten.
  const existingRun = await prisma.classificationRun.findFirst({
    where: { organizationId: organization.id },
    orderBy: { version: 'desc' },
  });
  if (!existingRun) {
    const demoAnswers = classificationAnswersSchema.parse({
      establishmentCountries: ['RO'],
      sectorCode: 'ict_service_management',
      subsectorCode: 'managed_services',
      entityTypeCode: 'managed_service_provider',
      size: {
        employees: 60,
        annualTurnoverEur: 12_000_000,
        balanceSheetTotalEur: 6_000_000,
      },
    });
    const computation = classify(roPack, demoAnswers);
    await prisma.classificationRun.create({
      data: {
        organizationId: organization.id,
        version: 1,
        inputs: demoAnswers as unknown as Prisma.InputJsonValue,
        result: computation.outcome as $Enums.ClassificationResult,
        confidence: computation.confidence,
        ruleId: computation.ruleId,
        reasonKey: computation.reasonKey,
        legalBasis: computation.legalBasis as unknown as Prisma.InputJsonValue,
        consequences: computation.consequences as unknown as Prisma.InputJsonValue,
        applicability: computation.documents as unknown as Prisma.InputJsonValue,
        jurisdictionPackCode: roPack.code,
        jurisdictionPackVersion: roPack.version,
        createdById: owner.id,
      },
    });
  }

  // A seeded network baseline so the Phase 5 canvas is immediately explorable.
  // Re-seeding never overwrites a user's layout, devices or assessments.
  const existingAudit = await prisma.audit.findFirst({
    where: { organizationId: organization.id, name: 'Demo network baseline' },
  });
  if (!existingAudit) {
    const audit = await prisma.audit.create({
      data: {
        organizationId: organization.id,
        name: 'Demo network baseline',
        period: '2026-Q4',
        scope: 'Head-office LAN, server VLAN, DMZ, guest Wi-Fi and cloud services.',
        methodology:
          'Inventory walkthrough with sample Nmap import, device interviews and configuration review.',
        auditorName: 'Demo Owner',
        limitations: 'Sample data for product demonstration; no live scan was performed.',
        createdById: owner.id,
      },
    });

    const zoneDefinitions = [
      { name: 'LAN', color: '#2563EB', bounds: { x: 0, y: 0, width: 620, height: 440 } },
      { name: 'DMZ', color: '#D97706', bounds: { x: 660, y: 0, width: 620, height: 440 } },
      { name: 'Guest', color: '#059669', bounds: { x: 0, y: 480, width: 620, height: 440 } },
      {
        name: 'Server VLAN',
        color: '#7C3AED',
        bounds: { x: 660, y: 480, width: 620, height: 440 },
      },
      { name: 'Cloud', color: '#0891B2', bounds: { x: 1320, y: 0, width: 620, height: 920 } },
    ];
    const zones = new Map<string, string>();
    for (const zone of zoneDefinitions) {
      const created = await prisma.zone.create({
        data: {
          organizationId: organization.id,
          auditId: audit.id,
          name: zone.name,
          color: zone.color,
          bounds: zone.bounds as Prisma.InputJsonValue,
        },
      });
      zones.set(zone.name, created.id);
    }

    const demoDevices: Array<{
      key: string;
      name: string;
      type: DeviceType;
      zone: string;
      position: { x: number; y: number };
      ipAddresses: string[];
      macAddress?: string;
      vendor?: string;
      model?: string;
      criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      ownerLabel?: string;
      assessment: DeviceAssessmentData;
      complete: boolean;
      notes?: string;
    }> = [
      {
        key: 'firewall',
        name: 'Edge firewall',
        type: 'FIREWALL',
        zone: 'DMZ',
        position: { x: 760, y: 100 },
        ipAddresses: ['192.0.2.1'],
        macAddress: 'AA:BB:CC:DD:EE:01',
        vendor: 'Fortinet',
        model: 'FortiGate 60F',
        criticality: 'CRITICAL',
        ownerLabel: 'IT',
        complete: true,
        assessment: {
          os: 'FortiOS 7.4',
          autoUpdate: true,
          adminAccountCount: 2,
          defaultCredentialsChanged: true,
          firewallReviewed: true,
          logsEnabled: true,
          centralLogging: true,
          internetExposed: true,
          physicalAccessControlled: true,
          physicalLocation: 'Server room rack 1',
        },
        notes: 'Primary internet edge with IPS and TLS inspection.',
      },
      {
        key: 'router',
        name: 'Core router',
        type: 'ROUTER',
        zone: 'DMZ',
        position: { x: 760, y: 250 },
        ipAddresses: ['192.0.2.2'],
        macAddress: 'AA:BB:CC:DD:EE:02',
        vendor: 'Cisco',
        model: 'ISR 1111',
        criticality: 'HIGH',
        ownerLabel: 'IT',
        complete: true,
        assessment: {
          os: 'IOS XE 17.12',
          autoUpdate: false,
          adminAccountCount: 3,
          defaultCredentialsChanged: true,
          firewallReviewed: true,
          logsEnabled: true,
          centralLogging: true,
          physicalAccessControlled: true,
        },
      },
      {
        key: 'switch',
        name: 'Access switch',
        type: 'SWITCH',
        zone: 'LAN',
        position: { x: 80, y: 100 },
        ipAddresses: ['192.0.2.10'],
        macAddress: 'AA:BB:CC:DD:EE:03',
        vendor: 'HPE',
        model: 'Aruba 2930F',
        criticality: 'HIGH',
        ownerLabel: 'IT',
        complete: true,
        assessment: {
          os: 'ArubaOS-S 16.11',
          adminAccountCount: 2,
          defaultCredentialsChanged: true,
          logsEnabled: true,
          centralLogging: true,
          physicalAccessControlled: true,
        },
      },
      {
        key: 'erp',
        name: 'ERP server',
        type: 'SERVER',
        zone: 'Server VLAN',
        position: { x: 760, y: 580 },
        ipAddresses: ['192.0.2.20'],
        macAddress: 'AA:BB:CC:DD:EE:04',
        vendor: 'Dell',
        model: 'PowerEdge R740',
        criticality: 'CRITICAL',
        ownerLabel: 'Finance IT',
        complete: true,
        assessment: {
          os: 'Windows Server 2012 R2',
          osVersion: '6.3',
          endOfSupportDate: '2023-10-10',
          lastPatchDate: '2026-08-01',
          autoUpdate: true,
          antivirusPresent: true,
          antivirusProduct: 'Defender',
          licenseExpiryDate: '2026-10-01',
          backupExists: true,
          backupMethod: 'Veeam to NAS',
          lastBackupDate: '2026-11-11',
          logsEnabled: true,
          centralLogging: true,
          diskEncryption: true,
        },
        notes: 'Legacy ERP host; migration project planned for next year.',
      },
      {
        key: 'workstation',
        name: 'Finance workstation',
        type: 'WORKSTATION',
        zone: 'LAN',
        position: { x: 300, y: 100 },
        ipAddresses: ['192.0.2.30'],
        macAddress: 'AA:BB:CC:DD:EE:05',
        vendor: 'Dell',
        model: 'OptiPlex 7010',
        criticality: 'MEDIUM',
        ownerLabel: 'Finance',
        complete: true,
        assessment: {
          os: 'Windows 11 Pro',
          autoUpdate: true,
          antivirusPresent: true,
          realTimeProtection: true,
          backupExists: true,
          backupMethod: 'OneDrive Known Folder Move',
          diskEncryption: true,
          logsEnabled: false,
        },
      },
      {
        key: 'laptop',
        name: 'Sales laptop',
        type: 'LAPTOP',
        zone: 'LAN',
        position: { x: 80, y: 280 },
        ipAddresses: ['192.0.2.31'],
        vendor: 'Lenovo',
        criticality: 'MEDIUM',
        ownerLabel: 'Sales',
        complete: false,
        assessment: {
          os: 'Windows 11 Pro',
          antivirusPresent: true,
          diskEncryption: true,
        },
        notes: 'Assessment still in progress; backup and update fields are missing.',
      },
      {
        key: 'printer',
        name: 'Reception printer',
        type: 'PRINTER',
        zone: 'Guest',
        position: { x: 80, y: 580 },
        ipAddresses: ['192.0.2.40'],
        macAddress: 'AA:BB:CC:DD:EE:06',
        vendor: 'HP',
        model: 'LaserJet Pro',
        criticality: 'LOW',
        complete: true,
        assessment: {
          autoUpdate: true,
          defaultCredentialsChanged: true,
          internetExposed: false,
          physicalAccessControlled: true,
        },
      },
      {
        key: 'camera',
        name: 'Entrance camera',
        type: 'IP_CAMERA',
        zone: 'DMZ',
        position: { x: 760, y: 360 },
        ipAddresses: ['192.0.2.50'],
        macAddress: 'AA:BB:CC:DD:EE:07',
        vendor: 'Hikvision',
        criticality: 'HIGH',
        ownerLabel: 'Facilities',
        complete: true,
        assessment: {
          autoUpdate: false,
          defaultCredentialsChanged: false,
          internetExposed: true,
          physicalAccessControlled: true,
        },
        notes: 'Vendor default password still active after installation.',
      },
      {
        key: 'cloud',
        name: 'Microsoft 365',
        type: 'CLOUD_SERVICE',
        zone: 'Cloud',
        position: { x: 1420, y: 100 },
        ipAddresses: ['203.0.113.10'],
        vendor: 'Microsoft',
        criticality: 'HIGH',
        ownerLabel: 'IT',
        complete: true,
        assessment: {
          mfaEnabled: true,
          mfaType: 'Authenticator app',
          backupExists: true,
          backupMethod: 'Vendor geo-redundant',
          encryptionAtRest: true,
          encryptionInTransit: true,
          logsEnabled: true,
          centralLogging: true,
        },
      },
    ];

    const createdDevices = new Map<string, string>();
    for (const device of demoDevices) {
      const computed = evaluateDeviceCompleteness({
        type: device.type,
        name: device.name,
        ipAddresses: device.ipAddresses,
        macAddress: device.macAddress ?? null,
        criticality: device.criticality,
        ownerLabel: device.ownerLabel ?? null,
        assessment: device.assessment,
      });
      const informationComplete = device.complete && computed.informationCompleteAllowed;
      const created = await prisma.device.create({
        data: {
          organizationId: organization.id,
          auditId: audit.id,
          zoneId: zones.get(device.zone) ?? null,
          name: device.name,
          type: device.type,
          vendor: device.vendor ?? null,
          model: device.model ?? null,
          criticality: device.criticality,
          ipAddresses: device.ipAddresses,
          macAddress: device.macAddress ?? null,
          ownerLabel: device.ownerLabel ?? null,
          source: 'MANUAL',
          position: device.position as Prisma.InputJsonValue,
          notes: device.notes ?? null,
          completeness: computed.percentage,
          informationComplete,
          assessment: {
            create: {
              organizationId: organization.id,
              data: device.assessment as Prisma.InputJsonValue,
              completeness: computed.percentage,
              informationComplete,
              assessedById: owner.id,
            },
          },
        },
      });
      createdDevices.set(device.key, created.id);
    }

    const links: Array<[string, string]> = [
      ['firewall', 'router'],
      ['router', 'switch'],
      ['switch', 'erp'],
      ['switch', 'workstation'],
      ['switch', 'laptop'],
      ['router', 'camera'],
      ['router', 'cloud'],
      ['switch', 'printer'],
    ];
    for (const [sourceKey, targetKey] of links) {
      const sourceDeviceId = createdDevices.get(sourceKey);
      const targetDeviceId = createdDevices.get(targetKey);
      if (!sourceDeviceId || !targetDeviceId) continue;
      await prisma.connection.create({
        data: {
          organizationId: organization.id,
          auditId: audit.id,
          sourceDeviceId,
          targetDeviceId,
          type: sourceKey === 'router' && targetKey === 'cloud' ? 'VPN' : 'WIRED',
          speedMbps: 1000,
          vlan: targetKey === 'erp' ? 20 : undefined,
        },
      });
    }
  }

  console.log(`[seed] demo organization ready: ${organization.name} (${organization.id})`);
  console.log(`[seed] demo owner: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`[seed] classification pack: ${roPack.code}@${roPack.version} (${roPack.status})`);
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
