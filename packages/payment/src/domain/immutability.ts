export type SafeMetadataValue = string | number | boolean | null;

export type SafeMetadata = Readonly<Record<string, SafeMetadataValue>>;

export const cloneDate = (value: Date): Date => new Date(value.getTime());

export const copySafeMetadata = (metadata: Readonly<Record<string, unknown>>): SafeMetadata => {
  const copy: Record<string, SafeMetadataValue> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      copy[key] = value;
    }
  }

  return copy;
};
