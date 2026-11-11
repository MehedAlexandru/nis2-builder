import { classificationPackSchema, type ClassificationPack } from '../../schemas/classification';
import roPackJson from './ro-0.2.0-draft.json';

/**
 * Jurisdiction classification packs are loaded, validated and versioned as
 * data. The API seeds the active pack into `jurisdiction_packs`; tests and the
 * seed import the validated in-memory copy.
 */
const roPack = classificationPackSchema.parse(roPackJson);

export const classificationPacks: Record<string, ClassificationPack> = {
  RO: roPack,
};

export function getClassificationPack(code: string): ClassificationPack | undefined {
  return classificationPacks[code.toUpperCase()];
}

export const classificationPackList = Object.values(classificationPacks);
