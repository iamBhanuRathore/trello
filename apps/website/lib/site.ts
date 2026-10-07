export const NAV_LINKS = [
  { href: '#tour', label: 'Product' },
  { href: '#demo', label: 'Live demo' },
  { href: '#templates', label: 'Templates' },
  { href: '#customers', label: 'Customers' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#compare', label: 'Compare' },
  { href: '#faq', label: 'FAQ' },
] as const;

export const FOOTER_COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Tour', href: '#tour' },
      { label: 'Live demo', href: '#demo' },
      { label: 'Templates', href: '#templates' },
      { label: 'Integrations', href: '#integrations' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Compare', href: '#compare' },
    ],
  },
  {
    title: 'Architecture',
    links: [
      { label: 'Panels & roles', href: '#panels' },
      { label: 'Domain model', href: '#model' },
      { label: 'Sprints & stages', href: '#planning' },
      { label: 'Security', href: '#security' },
      { label: 'Tech stack', href: '#stack' },
      { label: 'Roadmap', href: '#roadmap' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Sign up free', href: '#signup' },
      { label: 'Open dashboard', href: 'http://localhost:5173' },
      { label: 'Super Admin', href: 'http://localhost:5174' },
      { label: 'API docs', href: 'http://localhost:3001/docs' },
    ],
  },
];

export const APP_LINKS = {
  dashboard: 'http://localhost:5173',
  superAdmin: 'http://localhost:5174',
  apiDocs: 'http://localhost:3001/docs',
  health: 'http://localhost:3001/health',
} as const;
