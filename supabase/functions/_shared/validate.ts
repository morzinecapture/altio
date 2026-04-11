export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function assertString(val: unknown, field: string): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return val.trim();
}

export function assertUUID(val: unknown, field: string): string {
  const s = assertString(val, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    throw new ValidationError(`${field} must be a valid UUID`);
  }
  return s;
}

export function assertPositiveInt(val: unknown, field: string, max = 99999900): number {
  const n = typeof val === 'string' ? parseInt(val, 10) : val;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > max) {
    throw new ValidationError(`${field} must be a positive integer (max ${max})`);
  }
  return n;
}

export function assertOneOf<T extends string>(val: unknown, field: string, options: readonly T[]): T {
  const s = assertString(val, field);
  if (!options.includes(s as T)) {
    throw new ValidationError(`${field} must be one of: ${options.join(', ')}`);
  }
  return s as T;
}

export function assertOptionalString(val: unknown, field: string): string | undefined {
  if (val === undefined || val === null) return undefined;
  return assertString(val, field);
}
