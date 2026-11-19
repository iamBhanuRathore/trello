export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat().format(value);
}

export function baseApiUrl(): string {
  return (import.meta.env.VITE_API_URL || 'http://localhost:3001/v1').replace(/\/$/, '');
}
