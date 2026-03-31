import { z } from 'zod';

/**
 * Resolve timezone using fallback chain: config → system → UTC (DEC-3.4)
 */
export function resolveTimezone(configTimezone?: string): string {
  if (configTimezone) return configTimezone;

  try {
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (systemTz) return systemTz;
  } catch {
    // Intl not available
  }

  return 'UTC';
}

/**
 * Check if an ISO 8601 string includes timezone information.
 */
function hasTimezone(isoString: string): boolean {
  // Check for Z, +HH:MM, -HH:MM at the end
  return /(?:Z|[+-]\d{2}:\d{2})\s*$/.test(isoString);
}

/**
 * Append a timezone offset to an ISO 8601 string that lacks one.
 * Uses the IANA timezone name to compute the offset for the given datetime.
 */
function appendTimezone(isoString: string, timezone: string): string {
  if (timezone === 'UTC') {
    return isoString + 'Z';
  }

  try {
    // Parse the date and format with the target timezone to get the offset
    const date = new Date(isoString + 'Z'); // Parse as UTC first
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart) {
      // Convert "GMT-4" or "GMT+5:30" to "-04:00" or "+05:30"
      const match = tzPart.value.match(/GMT([+-]?)(\d+)(?::(\d+))?/);
      if (match) {
        const sign = match[1] || '+';
        const hours = match[2]!.padStart(2, '0');
        const minutes = (match[3] || '0').padStart(2, '0');
        return isoString + sign + hours + ':' + minutes;
      }
    }
  } catch {
    // Fallback: just append Z
  }

  return isoString + 'Z';
}

/**
 * Create a Zod schema for datetime fields (DEC-3.4).
 * Validates ISO 8601 strings and appends timezone if missing.
 */
export function createDatetimeSchema(defaultTimezone?: string): z.ZodType<string> {
  const timezone = resolveTimezone(defaultTimezone);

  return z.string().transform((val, ctx) => {
    // Validate it's a parseable date
    const date = new Date(val.includes('T') ? val : val + 'T00:00:00');
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid datetime: "${val}" is not a valid ISO 8601 datetime`,
      });
      return val;
    }

    // Append timezone if missing
    if (!hasTimezone(val)) {
      return appendTimezone(val, timezone);
    }

    return val;
  });
}
