import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createConnectionInputSchema,
  createDeviceInputSchema,
  createNetworkAuditSchema,
  createZoneInputSchema,
  importDevicesInputSchema,
  mergeDevicesInputSchema,
  saveDeviceAssessmentSchema,
  saveMapLayoutSchema,
  updateConnectionInputSchema,
  updateDeviceInputSchema,
  updateNetworkAuditSchema,
  updateZoneInputSchema,
  type CreateConnectionInput,
  type CreateDeviceInput,
  type CreateNetworkAuditInput,
  type CreateZoneInput,
  type DeviceImportResult,
  type DuplicateDeviceGroup,
  type ImportDevicesInput,
  type MergeDevicesInput,
  type NetworkAuditSummary,
  type NetworkConnection,
  type NetworkDevice,
  type NetworkMap,
  type NetworkZone,
  type SaveDeviceAssessmentInput,
  type SaveMapLayoutInput,
  type UpdateConnectionInput,
  type UpdateDeviceInput,
  type UpdateNetworkAuditInput,
  type UpdateZoneInput,
} from '@nis2/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentAuth } from '../../common/auth/auth.decorators';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditsService, type NetworkActor } from './audits.service';
import { csvTemplate } from './imports';

@ApiTags('audits')
@Controller('audits')
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Get()
  list(@CurrentAuth() auth: AccessTokenClaims): Promise<NetworkAuditSummary[]> {
    return this.audits.list(actorOf(auth), organizationOf(auth));
  }

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createNetworkAuditSchema)) body: CreateNetworkAuditInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkAuditSummary> {
    return this.audits.create(actorOf(auth, request), organizationOf(auth), body);
  }

  @Get('import-template.csv')
  template(@Res() reply: FastifyReply): void {
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="nis2-device-import-template.csv"')
      .send(csvTemplate());
  }

  @Get(':auditId')
  map(
    @Param('auditId') auditId: string,
    @CurrentAuth() auth: AccessTokenClaims,
  ): Promise<NetworkMap> {
    return this.audits.map(actorOf(auth), organizationOf(auth), auditId);
  }

  @Patch(':auditId')
  update(
    @Param('auditId') auditId: string,
    @Body(new ZodValidationPipe(updateNetworkAuditSchema)) body: UpdateNetworkAuditInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkAuditSummary> {
    return this.audits.update(actorOf(auth, request), organizationOf(auth), auditId, body);
  }

  @Get(':auditId/duplicates')
  duplicates(
    @Param('auditId') auditId: string,
    @CurrentAuth() auth: AccessTokenClaims,
  ): Promise<DuplicateDeviceGroup[]> {
    return this.audits.duplicates(actorOf(auth), organizationOf(auth), auditId);
  }

  @Post(':auditId/devices')
  @HttpCode(201)
  createDevice(
    @Param('auditId') auditId: string,
    @Body(new ZodValidationPipe(createDeviceInputSchema)) body: CreateDeviceInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkDevice> {
    return this.audits.createDevice(actorOf(auth, request), organizationOf(auth), auditId, body);
  }

  @Patch(':auditId/devices/:deviceId')
  updateDevice(
    @Param('auditId') auditId: string,
    @Param('deviceId') deviceId: string,
    @Body(new ZodValidationPipe(updateDeviceInputSchema)) body: UpdateDeviceInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkDevice> {
    return this.audits.updateDevice(
      actorOf(auth, request),
      organizationOf(auth),
      auditId,
      deviceId,
      body,
    );
  }

  @Delete(':auditId/devices/:deviceId')
  @HttpCode(204)
  deleteDevice(
    @Param('auditId') auditId: string,
    @Param('deviceId') deviceId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.audits.deleteDevice(
      actorOf(auth, request),
      organizationOf(auth),
      auditId,
      deviceId,
    );
  }

  @Put(':auditId/devices/:deviceId/assessment')
  saveAssessment(
    @Param('auditId') auditId: string,
    @Param('deviceId') deviceId: string,
    @Body(new ZodValidationPipe(saveDeviceAssessmentSchema)) body: SaveDeviceAssessmentInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkDevice> {
    return this.audits.saveAssessment(
      actorOf(auth, request),
      organizationOf(auth),
      auditId,
      deviceId,
      body,
    );
  }

  @Post(':auditId/import')
  importDevices(
    @Param('auditId') auditId: string,
    @Body(new ZodValidationPipe(importDevicesInputSchema)) body: ImportDevicesInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DeviceImportResult> {
    return this.audits.importDevices(actorOf(auth, request), organizationOf(auth), auditId, body);
  }

  @Post(':auditId/merge')
  merge(
    @Param('auditId') auditId: string,
    @Body(new ZodValidationPipe(mergeDevicesInputSchema)) body: MergeDevicesInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkDevice> {
    return this.audits.merge(actorOf(auth, request), organizationOf(auth), auditId, body);
  }

  @Put(':auditId/layout')
  @HttpCode(204)
  saveLayout(
    @Param('auditId') auditId: string,
    @Body(new ZodValidationPipe(saveMapLayoutSchema)) body: SaveMapLayoutInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.audits.saveLayout(actorOf(auth, request), organizationOf(auth), auditId, body);
  }

  @Post(':auditId/zones')
  @HttpCode(201)
  createZone(
    @Param('auditId') auditId: string,
    @Body(new ZodValidationPipe(createZoneInputSchema)) body: CreateZoneInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkZone> {
    return this.audits.createZone(actorOf(auth, request), organizationOf(auth), auditId, body);
  }

  @Patch(':auditId/zones/:zoneId')
  updateZone(
    @Param('auditId') auditId: string,
    @Param('zoneId') zoneId: string,
    @Body(new ZodValidationPipe(updateZoneInputSchema)) body: UpdateZoneInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkZone> {
    return this.audits.updateZone(
      actorOf(auth, request),
      organizationOf(auth),
      auditId,
      zoneId,
      body,
    );
  }

  @Delete(':auditId/zones/:zoneId')
  @HttpCode(204)
  deleteZone(
    @Param('auditId') auditId: string,
    @Param('zoneId') zoneId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.audits.deleteZone(actorOf(auth, request), organizationOf(auth), auditId, zoneId);
  }

  @Post(':auditId/connections')
  @HttpCode(201)
  createConnection(
    @Param('auditId') auditId: string,
    @Body(new ZodValidationPipe(createConnectionInputSchema)) body: CreateConnectionInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkConnection> {
    return this.audits.createConnection(
      actorOf(auth, request),
      organizationOf(auth),
      auditId,
      body,
    );
  }

  @Patch(':auditId/connections/:connectionId')
  updateConnection(
    @Param('auditId') auditId: string,
    @Param('connectionId') connectionId: string,
    @Body(new ZodValidationPipe(updateConnectionInputSchema)) body: UpdateConnectionInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<NetworkConnection> {
    return this.audits.updateConnection(
      actorOf(auth, request),
      organizationOf(auth),
      auditId,
      connectionId,
      body,
    );
  }

  @Delete(':auditId/connections/:connectionId')
  @HttpCode(204)
  deleteConnection(
    @Param('auditId') auditId: string,
    @Param('connectionId') connectionId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.audits.deleteConnection(
      actorOf(auth, request),
      organizationOf(auth),
      auditId,
      connectionId,
    );
  }
}

function organizationOf(auth: AccessTokenClaims): string {
  if (!auth.org) {
    throw new BadRequestException({
      code: 'NO_ACTIVE_ORGANIZATION',
      message: 'Select an organization before using the network mapper',
    });
  }
  return auth.org;
}

function actorOf(auth: AccessTokenClaims, request?: FastifyRequest): NetworkActor {
  const userAgent = request?.headers['user-agent'];
  return {
    userId: auth.sub,
    globalRole: auth.role,
    ip: request?.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request?.id,
  };
}
