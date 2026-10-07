import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Boardly — Enterprise Kanban & Project Management',
  description:
    'Boardly is a multi-tenant Trello/Jira/Asana competitor: organizations, workspaces, projects, boards, sprints, phases, custom stages, docs, chat, automations, reports and enterprise governance.',
  metadataBase: new URL('https://boardly.example.com'),
  openGraph: {
    title: 'Boardly — Enterprise Kanban & Project Management',
    description:
      'One platform, many companies. Boards, sprints, phases, stages, docs, chat, automations and enterprise-grade RBAC, SSO, audit and billing.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[var(--background)] text-[var(--foreground)]">
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
