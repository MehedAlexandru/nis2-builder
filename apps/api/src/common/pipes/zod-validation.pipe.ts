import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates and narrows an unknown value with a Zod schema.
 *
 * Usage: `@Body(new ZodValidationPipe(createThingSchema)) body: CreateThing`.
 * The schema itself lives in `@nis2/shared` so the SPA can reuse it.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
