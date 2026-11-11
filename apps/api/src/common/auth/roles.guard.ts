import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { GlobalRole } from '@nis2/shared';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<GlobalRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const role = request.auth?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }
    return true;
  }
}
