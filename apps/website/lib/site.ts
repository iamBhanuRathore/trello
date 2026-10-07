export const NAV_LINKS = [
  { href: '#panels', label: 'Panels' },
  { href: '#model', label: 'Model' },
  { href: '#planning', label: 'Planning' },
  { href: '#stages', label: 'Stages' },
  { href: '#views', label: 'Views' },
  { href: '#power', label: 'Power' },
  { href: '#security', label: 'Security' },
  { href: '#stack', label: 'Stack' },
  { href: '#roadmap', label: 'Roadmap' },
  { href: '#pricing', label: 'Pricing' },
] as const;

export const APP_LINKS = {
  dashboard: 'http://localhost:5173',
  superAdmin: 'http://localhost:5174',
  apiDocs: 'http://localhost:3001/docs',
  health: 'http://localhost:3001/health',
} as const;
