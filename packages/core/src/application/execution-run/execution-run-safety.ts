const SENSITIVE_FIELD_NAMES = new Set([
  'secret',
  'password',
  'token',
  'authorization',
  'signature',
  'apiKey',
  'credential',
  'credentials',
]);

const sanitizeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(record)) {
    if (SENSITIVE_FIELD_NAMES.has(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    sanitized[key] = sanitizeValue(nestedValue);
  }

  return sanitized;
};

export const sanitizeExecutionMetadata = (
  metadata: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined => {
  if (metadata === undefined) {
    return undefined;
  }

  return sanitizeValue(metadata) as Readonly<Record<string, unknown>>;
};

export const sanitizeUnexpectedErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return 'Execution failed unexpectedly.';
  }

  return 'Execution failed unexpectedly.';
};

export const sanitizeStepFailureReason = (params: {
  failureCode?: string;
  failureReason?: string;
}): string | undefined => {
  if (params.failureCode === 'PROVISIONING_EXCEPTION') {
    return 'Digital product provisioning failed unexpectedly.';
  }

  return params.failureReason;
};

export const extractExternalOrderReference = (
  payload: Readonly<Record<string, unknown>>,
): string | undefined => {
  const order = payload.order;

  if (typeof order !== 'object' || order === null || Array.isArray(order)) {
    return undefined;
  }

  const orderId = (order as Record<string, unknown>).id;

  return typeof orderId === 'string' && orderId.trim().length > 0 ? orderId : undefined;
};
