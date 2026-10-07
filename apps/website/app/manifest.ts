import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Boardly — Enterprise Kanban',
    short_name: 'Boardly',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#6366f1',
    icons: [],
  };
}
