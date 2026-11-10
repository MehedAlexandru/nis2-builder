import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  name: z.string().min(2),
  count: z.coerce.number().int().positive(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value', () => {
    expect(pipe.transform({ name: 'ok', count: '2' })).toEqual({ name: 'ok', count: 2 });
  });

  it('throws a BadRequestException with flattened issues', () => {
    try {
      pipe.transform({ name: 'x', count: 0 });
      throw new Error('expected the pipe to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        code: string;
        details: unknown;
      };
      expect(response.code).toBe('VALIDATION_ERROR');
      expect(response.details).toBeDefined();
    }
  });
});
