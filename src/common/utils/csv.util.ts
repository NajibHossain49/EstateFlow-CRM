/**
 * Serializes tabular data to a CSV string. Values containing commas, quotes or
 * newlines are quoted and inner quotes are doubled (RFC 4180).
 */
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (value: string | number): string => {
    const str = String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
  return lines.join('\n');
}
