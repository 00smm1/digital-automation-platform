export type SafeMetadata = Readonly<Record<string, string>>;

export const createSafeMetadata = (
  metadata: Readonly<Record<string, string>> | undefined,
): SafeMetadata | undefined => {
  if (metadata === undefined) {
    return undefined;
  }

  return { ...metadata };
};

export const cloneSafeMetadata = (metadata: SafeMetadata | undefined): SafeMetadata | undefined =>
  metadata === undefined ? undefined : { ...metadata };
