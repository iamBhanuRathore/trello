/**
 * Enterprise Organization Seed Script — Acme Technologies (50 Members)
 *
 * Populates a full-featured realistic organization with 50 members, 5 workspaces,
 * 8 projects (Kanban & Scrum), 4 sprints, phases, 120+ cards, checklists, comments,
 * and 60 days of historical time logs and activity logs.
 *
 * Run with: bun run src/db/seedOrganization.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql, eq } from 'drizzle-orm';
import {
  plans,
  organizations,
  users,
  organizationMembers,
  subscriptions,
  workspaces,
  workspaceMembers,
  projects,
  projectMembers,
  boards,
  boardMembers,
  labels,
  lists,
  cards,
  cardAssignees,
  cardParticipants,
  cardWatchers,
  cardLabels,
  checklists,
  checklistItems,
  comments,
  sprints,
  cardSprints,
  phases,
  cardPhase,
  timeLogs,
  activityLog,
  auditLog,
  documents,
  intakeForms,
} from './schema/index';

const connectionString =
  process.env['DATABASE_URL'] || 'postgres://boardly:boardly_dev@localhost:5432/boardly';
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

// ─── Helper: Date Generators (spanning past 60 days) ─────────────────────────
function daysAgo(d: number, hours = 0, mins = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(date.getHours() - hours, date.getMinutes() - mins);
  return date;
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

// ─── 50 Realistic User Personas ──────────────────────────────────────────────
export interface UserPersona {
  name: string;
  email: string;
  orgRole: 'org_owner' | 'org_admin' | 'billing_manager' | 'workspace_admin' | 'member';
  title: string;
  /** Platform-level super-admin (Boardly OPS console). Only demo CEO holds this. */
  isPlatformAdmin?: boolean;
  department:
    | 'Executive'
    | 'Engineering'
    | 'Product'
    | 'Marketing'
    | 'Operations'
    | 'Customer Success'
    | 'External';
  avatarUrl: string;
}

export const SEED_USERS: UserPersona[] = [
  // ── Executive & Org Admins (6) ──
  {
    name: 'Alex Vance',
    email: 'alex.vance@acme.corp',
    orgRole: 'org_owner',
    title: 'Chief Executive Officer & Founder',
    isPlatformAdmin: true,
    department: 'Executive',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Elena Rostova',
    email: 'elena.rostova@acme.corp',
    orgRole: 'org_admin',
    title: 'Chief Technology Officer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Marcus Brody',
    email: 'marcus.brody@acme.corp',
    orgRole: 'org_admin',
    title: 'VP of Product Management',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Sarah Chen',
    email: 'sarah.chen@acme.corp',
    orgRole: 'org_admin',
    title: 'VP of Global Marketing',
    department: 'Marketing',
    avatarUrl:
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'David Sterling',
    email: 'david.sterling@acme.corp',
    orgRole: 'org_admin',
    title: 'VP of Operations & People',
    department: 'Operations',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@acme.corp',
    orgRole: 'org_admin',
    title: 'VP of Customer Success & Support',
    department: 'Customer Success',
    avatarUrl:
      'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80',
  },

  // ── Engineering Team (18) ──
  {
    name: 'Liam Gallagher',
    email: 'liam.gallagher@acme.corp',
    orgRole: 'member',
    title: 'Principal Software Architect',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Aria Montgomery',
    email: 'aria.montgomery@acme.corp',
    orgRole: 'member',
    title: 'Staff Frontend Engineer (React/Next)',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Leo Thorne',
    email: 'leo.thorne@acme.corp',
    orgRole: 'member',
    title: 'Senior Backend Engineer (Node/Bun/Postgres)',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Maya Lin',
    email: 'maya.lin@acme.corp',
    orgRole: 'member',
    title: 'Senior DevOps & Cloud Infrastructure Lead',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Lucas Dupont',
    email: 'lucas.dupont@acme.corp',
    orgRole: 'member',
    title: 'Senior Full Stack Engineer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Sofia Reyes',
    email: 'sofia.reyes@acme.corp',
    orgRole: 'member',
    title: 'Lead Mobile Developer (iOS/React Native)',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Ethan Hunt',
    email: 'ethan.hunt@acme.corp',
    orgRole: 'member',
    title: 'Application Security Engineer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Chloe Bennett',
    email: 'chloe.bennett@acme.corp',
    orgRole: 'member',
    title: 'Frontend Engineer (UI Components)',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Noah Williams',
    email: 'noah.williams@acme.corp',
    orgRole: 'member',
    title: 'Backend Systems Engineer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Zara Patel',
    email: 'zara.patel@acme.corp',
    orgRole: 'member',
    title: 'QA Lead & Automation Engineer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Oliver Queen',
    email: 'oliver.queen@acme.corp',
    orgRole: 'member',
    title: 'Site Reliability Engineer (SRE)',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Harper Lee',
    email: 'harper.lee@acme.corp',
    orgRole: 'member',
    title: 'Full Stack Engineer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1548142813-c348350df52b?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Benjamin Cole',
    email: 'benjamin.cole@acme.corp',
    orgRole: 'member',
    title: 'Database Architect (Postgres & Redis)',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Nadia Kaminski',
    email: 'nadia.kaminski@acme.corp',
    orgRole: 'member',
    title: 'Junior Frontend Engineer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Caleb Evans',
    email: 'caleb.evans@acme.corp',
    orgRole: 'member',
    title: 'Junior Backend Engineer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Isla Morales',
    email: 'isla.morales@acme.corp',
    orgRole: 'member',
    title: 'Mobile Engineer (Android/Kotlin)',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Felix Zhang',
    email: 'felix.zhang@acme.corp',
    orgRole: 'member',
    title: 'Performance & WebSockets Specialist',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Amara Diop',
    email: 'amara.diop@acme.corp',
    orgRole: 'member',
    title: 'QA Automation Engineer',
    department: 'Engineering',
    avatarUrl:
      'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80',
  },

  // ── Product & Design (8) ──
  {
    name: 'Jordan Rivera',
    email: 'jordan.rivera@acme.corp',
    orgRole: 'member',
    title: 'Lead Product Manager (Core Experience)',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Clara Oswald',
    email: 'clara.oswald@acme.corp',
    orgRole: 'member',
    title: 'Principal Product Designer',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Julian Vance',
    email: 'julian.vance@acme.corp',
    orgRole: 'member',
    title: 'Product Manager (Integrations & API)',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Freya Lind',
    email: 'freya.lind@acme.corp',
    orgRole: 'member',
    title: 'Senior UI/UX Designer (Design System)',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Samuel Green',
    email: 'samuel.green@acme.corp',
    orgRole: 'member',
    title: 'UX Researcher',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Valerie Pierce',
    email: 'valerie.pierce@acme.corp',
    orgRole: 'member',
    title: 'Product Designer (Mobile)',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Arthur Pendelton',
    email: 'arthur.pendelton@acme.corp',
    orgRole: 'member',
    title: 'Technical Writer & Documentation PM',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Mila Kunis',
    email: 'mila.kunis@acme.corp',
    orgRole: 'member',
    title: 'Associate Product Designer',
    department: 'Product',
    avatarUrl:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
  },

  // ── Growth & Marketing (7) ──
  {
    name: 'Gabriel Rossi',
    email: 'gabriel.rossi@acme.corp',
    orgRole: 'member',
    title: 'Head of Growth Marketing',
    department: 'Marketing',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Emma Watson',
    email: 'emma.watson@acme.corp',
    orgRole: 'member',
    title: 'Senior Content Marketing Lead',
    department: 'Marketing',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Rohan Mehta',
    email: 'rohan.mehta@acme.corp',
    orgRole: 'member',
    title: 'SEO & Performance Marketing Specialist',
    department: 'Marketing',
    avatarUrl:
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Lily Collins',
    email: 'lily.collins@acme.corp',
    orgRole: 'member',
    title: 'Brand Designer & Visual Stylist',
    department: 'Marketing',
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Trevor Belmont',
    email: 'trevor.belmont@acme.corp',
    orgRole: 'member',
    title: 'Product Marketing Manager',
    department: 'Marketing',
    avatarUrl:
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Hannah Abbott',
    email: 'hannah.abbott@acme.corp',
    orgRole: 'member',
    title: 'Social Media & Community Lead',
    department: 'Marketing',
    avatarUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Victor Stone',
    email: 'victor.stone@acme.corp',
    orgRole: 'member',
    title: 'Event & Developer Relations Coordinator',
    department: 'Marketing',
    avatarUrl:
      'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
  },

  // ── Operations & People Ops (5) ──
  {
    name: 'Victoria Chase',
    email: 'victoria.chase@acme.corp',
    orgRole: 'member',
    title: 'Director of People Operations',
    department: 'Operations',
    avatarUrl:
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Nathan Drake',
    email: 'nathan.drake@acme.corp',
    orgRole: 'member',
    title: 'Compliance & Security Audit Officer',
    department: 'Operations',
    avatarUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Zoe Saldana',
    email: 'zoe.saldana@acme.corp',
    orgRole: 'member',
    title: 'Talent Acquisition & Recruiting Lead',
    department: 'Operations',
    avatarUrl:
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Cedric Diggory',
    email: 'cedric.diggory@acme.corp',
    orgRole: 'member',
    title: 'Workplace Operations Manager',
    department: 'Operations',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Penelope Featherington',
    email: 'penelope.f@acme.corp',
    orgRole: 'member',
    title: 'Executive Assistant & Coordinator',
    department: 'Operations',
    avatarUrl:
      'https://images.unsplash.com/photo-1548142813-c348350df52b?w=150&auto=format&fit=crop&q=80',
  },

  // ── Customer Success & Solutions (6) ──
  {
    name: 'Dominic Toretto',
    email: 'dominic.toretto@acme.corp',
    orgRole: 'member',
    title: 'Director of Enterprise Solutions',
    department: 'Customer Success',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Jessica Jones',
    email: 'jessica.jones@acme.corp',
    orgRole: 'member',
    title: 'Senior Customer Success Manager',
    department: 'Customer Success',
    avatarUrl:
      'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Simon Riley',
    email: 'simon.riley@acme.corp',
    orgRole: 'member',
    title: 'Enterprise Onboarding Specialist',
    department: 'Customer Success',
    avatarUrl:
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Elena Gilbert',
    email: 'elena.gilbert@acme.corp',
    orgRole: 'member',
    title: 'Customer Support Lead (Tier 3)',
    department: 'Customer Success',
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Gavin Belson',
    email: 'gavin.belson@acme.corp',
    orgRole: 'member',
    title: 'Solutions Architect',
    department: 'Customer Success',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Serena Van Der Woodsen',
    email: 'serena.v@acme.corp',
    orgRole: 'member',
    title: 'Customer Experience Associate',
    department: 'Customer Success',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },

  // ── Viewers / External Auditors (4) ──
  {
    name: 'Dr. Raymond Vance',
    email: 'raymond.vance@board.acme.corp',
    orgRole: 'member',
    title: 'Board of Directors Observer',
    department: 'External',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Miriam Vance',
    email: 'miriam.vance@board.acme.corp',
    orgRole: 'member',
    title: 'Board Investor & Advisor',
    department: 'External',
    avatarUrl:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Harrison Wells',
    email: 'harrison.wells@auditor.compliance.org',
    orgRole: 'member',
    title: 'External SOC 2 Lead Auditor',
    department: 'External',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: 'Diana Prince',
    email: 'diana.prince@legal.advisors.com',
    orgRole: 'member',
    title: 'Outside Legal & IP Counsel',
    department: 'External',
    avatarUrl:
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  },
];

export async function seedFullOrganization(force = false) {
  try {
    // Platform-admin backfill (idempotent, runs even on the fast-path skip below):
    // the OPS console login + superadmin.spec expect Alex to hold isPlatformAdmin.
    await db
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(eq(users.email, 'alex.vance@acme.corp'))
      .catch(() => {});
    // Fast path: dev.sh runs this on every boot. A full replay is ~3-4 min of
    // sequential statements plus unbounded log-table growth (time/audit/activity
    // rows have no conflict guard). Skip when the org looks complete.
    if (!force) {
      const [orgRow] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, 'acme-corp'))
        .limit(1);
      if (orgRow) {
        const [memberCount] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(organizationMembers)
          .where(eq(organizationMembers.organizationId, orgRow.id));
        const [cardRow] = await db
          .select({ id: cards.id })
          .from(cards)
          .where(eq(cards.organizationId, orgRow.id))
          .limit(1);
        if ((memberCount?.n ?? 0) >= 50 && cardRow) {
          console.log(
            '⏭️  Acme seed data already present (50 members + cards) — skipping enterprise reseed.'
          );
          console.log('   Re-run with --force to replay the full seed.');
          return;
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🚀  Seeding Enterprise Organization: Acme Technologies (50 Members)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Pre-calculate hash for Password123!
    const passwordHash = await Bun.password.hash('Password123!', { algorithm: 'bcrypt', cost: 10 });

    // 1. Ensure Enterprise Plan
    console.log('📦  Setting up Enterprise Plan...');
    let [enterprisePlan] = await db
      .select()
      .from(plans)
      .where(eq(plans.tier, 'enterprise'))
      .limit(1);

    if (!enterprisePlan) {
      [enterprisePlan] = await db
        .insert(plans)
        .values({
          name: 'Enterprise Plan',
          tier: 'enterprise',
          maxSeats: null,
          maxWorkspaces: null,
          maxBoards: null,
          maxStorageGb: null,
        })
        .returning();
    }

    // 2. Create or find Organization: Acme Technologies
    console.log('🏢  Provisioning Acme Technologies Organization...');
    let [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'acme-corp'))
      .limit(1);

    if (!org) {
      [org] = await db
        .insert(organizations)
        .values({
          name: 'Acme Technologies',
          slug: 'acme-corp',
          planId: enterprisePlan!.id,
          ssoEnabled: true,
          logoUrl:
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
          primaryColor: '#6366f1',
        })
        .returning();
    }

    // Ensure Subscription
    const existingSub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org!.id))
      .limit(1);

    if (existingSub.length === 0) {
      await db.insert(subscriptions).values({
        organizationId: org!.id,
        planId: enterprisePlan!.id,
        status: 'active',
        seatCount: 50,
        currentPeriodStart: daysAgo(60),
        currentPeriodEnd: daysAgo(-305),
      });
    }

    // 3. Provision All 50 Users & Org Memberships
    console.log('👥  Creating 50 Team Members with "Password123!" credentials...');
    const userMap = new Map<string, { id: string; persona: UserPersona }>();

    for (const persona of SEED_USERS) {
      let [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, persona.email.toLowerCase()))
        .limit(1);

      if (!dbUser) {
        [dbUser] = await db
          .insert(users)
          .values({
            name: persona.name,
            email: persona.email.toLowerCase(),
            passwordHash,
            avatarUrl: persona.avatarUrl,
            timezone: 'America/New_York',
            isPlatformAdmin: persona.isPlatformAdmin ?? false,
          })
          .returning();
      } else if ((dbUser.isPlatformAdmin ?? false) !== (persona.isPlatformAdmin ?? false)) {
        // Keep the flag in sync on re-runs (e.g. Alex ⇄ platform admin).
        [dbUser] = await db
          .update(users)
          .set({ isPlatformAdmin: persona.isPlatformAdmin ?? false })
          .where(eq(users.id, dbUser.id))
          .returning();
      }

      // Link to Organization
      const existingMember = await db
        .select()
        .from(organizationMembers)
        .where(sql`organization_id = ${org!.id} AND user_id = ${dbUser!.id}`)
        .limit(1);

      if (existingMember.length === 0) {
        await db.insert(organizationMembers).values({
          organizationId: org!.id,
          userId: dbUser!.id,
          role: persona.orgRole,
          status: 'active',
        });
      }

      userMap.set(persona.email, { id: dbUser!.id, persona });
    }

    const allUserIds = Array.from(userMap.values()).map((u) => u.id);
    const getUser = (email: string) => userMap.get(email)!.id;

    // 4. Create 5 Diverse Workspaces
    console.log('📂  Configuring 5 Department Workspaces...');
    const workspaceDefs = [
      {
        name: 'Engineering & Cloud Infrastructure',
        description:
          'Core web architecture, backend microservices, iOS/Android mobile apps, and AWS infrastructure.',
        admins: ['elena.rostova@acme.corp', 'liam.gallagher@acme.corp'],
        members: [
          'alex.vance@acme.corp',
          'aria.montgomery@acme.corp',
          'leo.thorne@acme.corp',
          'maya.lin@acme.corp',
          'lucas.dupont@acme.corp',
          'sofia.reyes@acme.corp',
          'ethan.hunt@acme.corp',
          'chloe.bennett@acme.corp',
          'noah.williams@acme.corp',
          'zara.patel@acme.corp',
          'oliver.queen@acme.corp',
          'harper.lee@acme.corp',
          'benjamin.cole@acme.corp',
          'nadia.kaminski@acme.corp',
          'caleb.evans@acme.corp',
          'isla.morales@acme.corp',
          'felix.zhang@acme.corp',
          'amara.diop@acme.corp',
        ],
      },
      {
        name: 'Product Management & UX',
        description:
          'Product strategy, discovery, design system, user research, roadmap, and prototyping.',
        admins: ['marcus.brody@acme.corp', 'clara.oswald@acme.corp'],
        members: [
          'alex.vance@acme.corp',
          'jordan.rivera@acme.corp',
          'julian.vance@acme.corp',
          'freya.lind@acme.corp',
          'samuel.green@acme.corp',
          'valerie.pierce@acme.corp',
          'arthur.pendelton@acme.corp',
          'mila.kunis@acme.corp',
          'aria.montgomery@acme.corp',
          'chloe.bennett@acme.corp',
        ],
      },
      {
        name: 'Growth & Product Marketing',
        description:
          'Global campaigns, product launches, SEO, developer advocacy, content marketing, and brand.',
        admins: ['sarah.chen@acme.corp', 'gabriel.rossi@acme.corp'],
        members: [
          'alex.vance@acme.corp',
          'emma.watson@acme.corp',
          'rohan.mehta@acme.corp',
          'lily.collins@acme.corp',
          'trevor.belmont@acme.corp',
          'hannah.abbott@acme.corp',
          'victor.stone@acme.corp',
          'jordan.rivera@acme.corp',
        ],
      },
      {
        name: 'Security, Compliance & People Ops',
        description:
          'SOC 2 Type II certification, GDPR compliance, HR onboarding, legal, and workplace operations.',
        admins: ['david.sterling@acme.corp', 'victoria.chase@acme.corp'],
        members: [
          'alex.vance@acme.corp',
          'nathan.drake@acme.corp',
          'zoe.saldana@acme.corp',
          'cedric.diggory@acme.corp',
          'penelope.f@acme.corp',
          'ethan.hunt@acme.corp',
          'harrison.wells@auditor.compliance.org',
          'diana.prince@legal.advisors.com',
        ],
      },
      {
        name: 'Customer Success & Enterprise Support',
        description:
          'Tier 1-3 enterprise onboarding, customer health monitoring, SLA delivery, and solutions engineering.',
        admins: ['priya.sharma@acme.corp', 'dominic.toretto@acme.corp'],
        members: [
          'alex.vance@acme.corp',
          'jessica.jones@acme.corp',
          'simon.riley@acme.corp',
          'elena.gilbert@acme.corp',
          'gavin.belson@acme.corp',
          'serena.v@acme.corp',
          'leo.thorne@acme.corp',
          'zara.patel@acme.corp',
        ],
      },
    ];

    const wsMap = new Map<string, string>();

    for (const wDef of workspaceDefs) {
      let [ws] = await db
        .select()
        .from(workspaces)
        .where(sql`organization_id = ${org!.id} AND name = ${wDef.name}`)
        .limit(1);

      if (!ws) {
        [ws] = await db
          .insert(workspaces)
          .values({
            organizationId: org!.id,
            name: wDef.name,
            description: wDef.description,
            visibility: 'org',
          })
          .returning();
      }

      wsMap.set(wDef.name, ws!.id);

      // Assign Admins
      for (const adminEmail of wDef.admins) {
        const uId = getUser(adminEmail);
        await db
          .insert(workspaceMembers)
          .values({ workspaceId: ws!.id, userId: uId, role: 'admin' })
          .onConflictDoNothing();
      }

      // Assign Members
      for (const memberEmail of wDef.members) {
        const uId = getUser(memberEmail);
        await db
          .insert(workspaceMembers)
          .values({ workspaceId: ws!.id, userId: uId, role: 'member' })
          .onConflictDoNothing();
      }
    }

    // 5. Create 8 Realistic Projects (Scrum, Kanban, Phased)
    console.log('📋  Creating 8 Enterprise Projects & Kanban/Scrum Boards...');

    const projectDefs = [
      {
        name: 'Boardly Core Web App (v2.0)',
        key: 'BCW',
        workspaceName: 'Engineering & Cloud Infrastructure',
        description:
          'Next-gen reactive project management platform featuring real-time WebSockets, micro-interactions, and glassmorphic UI.',
        status: 'active' as const,
        startDate: toISODate(daysAgo(60)),
        endDate: toISODate(daysAgo(-60)),
      },
      {
        name: 'Cloud Infrastructure & Kubernetes Architecture',
        key: 'CIK',
        workspaceName: 'Engineering & Cloud Infrastructure',
        description:
          'Multi-region AWS EKS deployment, Redis caching cluster, and Postgres read replicas.',
        status: 'active' as const,
        startDate: toISODate(daysAgo(50)),
        endDate: toISODate(daysAgo(-40)),
      },
      {
        name: 'Mobile Apps Suite (iOS & Android)',
        key: 'MAS',
        workspaceName: 'Engineering & Cloud Infrastructure',
        description:
          'Cross-platform native mobile experience built with React Native, offline SQLite cache, and push notifications.',
        status: 'active' as const,
        startDate: toISODate(daysAgo(45)),
        endDate: toISODate(daysAgo(-45)),
      },
      {
        name: 'Design System & Glassmorphic UI 2.0',
        key: 'DSG',
        workspaceName: 'Product Management & UX',
        description:
          'Unified React component library, accessibility audits (WCAG AAA), and custom theme tokens.',
        status: 'active' as const,
        startDate: toISODate(daysAgo(55)),
        endDate: toISODate(daysAgo(-20)),
      },
      {
        name: 'Customer Feedback & Product Roadmap Q3/Q4',
        key: 'CFP',
        workspaceName: 'Product Management & UX',
        description:
          'Customer discovery insights, user interviews, feature scoring matrix, and executive roadmap.',
        status: 'active' as const,
        startDate: toISODate(daysAgo(40)),
        endDate: toISODate(daysAgo(-90)),
      },
      {
        name: 'Q3 Global Product Launch Campaign',
        key: 'QGP',
        workspaceName: 'Growth & Product Marketing',
        description:
          'Multi-channel product launch on Product Hunt, Hacker News, social ads, press releases, and partner webinars.',
        status: 'active' as const,
        startDate: toISODate(daysAgo(30)),
        endDate: toISODate(daysAgo(-30)),
      },
      {
        name: 'SOC 2 Type II Security Certification',
        key: 'S2T',
        workspaceName: 'Security, Compliance & People Ops',
        description:
          'Enterprise security posture assessment, KMS encryption keys rotation, and external compliance audit.',
        status: 'active' as const,
        startDate: toISODate(daysAgo(60)),
        endDate: toISODate(daysAgo(-15)),
      },
      {
        name: 'Enterprise Tier Onboarding & SLA Desk',
        key: 'ETO',
        workspaceName: 'Customer Success & Enterprise Support',
        description:
          'White-glove customer migration pipelines, automated SLA breach escalations, and customer health dashboards.',
        status: 'active' as const,
        startDate: toISODate(daysAgo(50)),
        endDate: toISODate(daysAgo(-30)),
      },
    ];

    const projMap = new Map<
      string,
      {
        id: string;
        key: string;
        boardId: string;
        listMap: Map<string, string>;
        labelMap: Map<string, string>;
        taskCounter: number;
      }
    >();

    for (const pDef of projectDefs) {
      const wsId = wsMap.get(pDef.workspaceName)!;

      let [proj] = await db
        .select()
        .from(projects)
        .where(sql`organization_id = ${org!.id} AND name = ${pDef.name}`)
        .limit(1);

      if (!proj) {
        [proj] = await db
          .insert(projects)
          .values({
            organizationId: org!.id,
            workspaceId: wsId,
            name: pDef.name,
            key: pDef.key,
            description: pDef.description,
            status: pDef.status,
            startDate: pDef.startDate,
            endDate: pDef.endDate,
          })
          .returning();
      }

      // Assign project members
      for (const uId of allUserIds.slice(0, 15)) {
        await db
          .insert(projectMembers)
          .values({ projectId: proj!.id, userId: uId, role: 'member' })
          .onConflictDoNothing();
      }

      // Create main board for this project
      let [board] = await db
        .select()
        .from(boards)
        .where(sql`organization_id = ${org!.id} AND project_id = ${proj!.id}`)
        .limit(1);

      if (!board) {
        [board] = await db
          .insert(boards)
          .values({
            organizationId: org!.id,
            projectId: proj!.id,
            name: `${pDef.name} Board`,
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          })
          .returning();
      }

      for (const uId of allUserIds.slice(0, 15)) {
        await db
          .insert(boardMembers)
          .values({ boardId: board!.id, userId: uId, role: 'member' })
          .onConflictDoNothing();
      }

      // Standard Lists
      const listNames = ['Backlog', 'To Do', 'In Progress', 'In Review / QA', 'Done'];
      const listMap = new Map<string, string>();

      for (let i = 0; i < listNames.length; i++) {
        const lName = listNames[i]!;
        let [lst] = await db
          .select()
          .from(lists)
          .where(sql`board_id = ${board!.id} AND name = ${lName}`)
          .limit(1);

        if (!lst) {
          [lst] = await db
            .insert(lists)
            .values({
              boardId: board!.id,
              name: lName,
              position: (i + 1) * 1000,
            })
            .returning();
        }
        listMap.set(lName, lst!.id);
      }

      // Standard Labels
      const labelDefs = [
        { name: 'P0 Blocker', color: '#ef4444' },
        { name: 'Frontend', color: '#3b82f6' },
        { name: 'Backend', color: '#10b981' },
        { name: 'Feature', color: '#8b5cf6' },
        { name: 'Bug', color: '#f97316' },
        { name: 'Design', color: '#ec4899' },
        { name: 'DevOps & Infra', color: '#06b6d4' },
        { name: 'Security', color: '#eab308' },
      ];
      const labelMap = new Map<string, string>();

      for (const lbl of labelDefs) {
        let [dbLbl] = await db
          .select()
          .from(labels)
          .where(sql`board_id = ${board!.id} AND name = ${lbl.name}`)
          .limit(1);

        if (!dbLbl) {
          [dbLbl] = await db
            .insert(labels)
            .values({
              boardId: board!.id,
              name: lbl.name,
              color: lbl.color,
            })
            .returning();
        }
        labelMap.set(lbl.name, dbLbl!.id);
      }

      projMap.set(pDef.name, {
        id: proj!.id,
        key: pDef.key,
        boardId: board!.id,
        listMap,
        labelMap,
        taskCounter: 0,
      });
    }

    // 6. Seed Sprints for "Boardly Core Web App (v2.0)"
    console.log('🏃  Configuring 4 Sprints across 60 days history...');
    const coreProj = projMap.get('Boardly Core Web App (v2.0)')!;

    const sprintDefs = [
      {
        name: 'Sprint 24 — Foundation & Real-time Core',
        type: 'biweekly' as const,
        startDate: toISODate(daysAgo(60)),
        endDate: toISODate(daysAgo(45)),
        goal: 'Deliver initial WebSocket sync engine, database schema migrations, and core auth.',
        status: 'completed' as const,
      },
      {
        name: 'Sprint 25 — Kanban DND & Drag Interactions',
        type: 'biweekly' as const,
        startDate: toISODate(daysAgo(45)),
        endDate: toISODate(daysAgo(30)),
        goal: 'Implement smooth optimistic UI card dragging, custom stage transitions, and activity log.',
        status: 'completed' as const,
      },
      {
        name: 'Sprint 26 — Enterprise RBAC & Notification Hub',
        type: 'biweekly' as const,
        startDate: toISODate(daysAgo(30)),
        endDate: toISODate(daysAgo(-7)),
        goal: 'Deliver granular permission matrices, email/push notification queue, and time tracking reports.',
        status: 'active' as const,
      },
      {
        name: 'Sprint 27 — Mobile Offline Sync & Automation Rules',
        type: 'biweekly' as const,
        startDate: toISODate(daysAgo(-7)),
        endDate: toISODate(daysAgo(-21)),
        goal: 'Implement offline-first SQLite synchronizer and visual automation rule builder.',
        status: 'planned' as const,
      },
    ];

    const sprintMap = new Map<string, string>();
    for (const sDef of sprintDefs) {
      let [sp] = await db
        .select()
        .from(sprints)
        .where(sql`project_id = ${coreProj.id} AND name = ${sDef.name}`)
        .limit(1);

      if (!sp) {
        [sp] = await db
          .insert(sprints)
          .values({
            projectId: coreProj.id,
            name: sDef.name,
            type: sDef.type,
            startDate: sDef.startDate,
            endDate: sDef.endDate,
            goal: sDef.goal,
            status: sDef.status,
          })
          .returning();
      }
      sprintMap.set(sDef.name, sp!.id);
    }

    // 7. Seed Phases for "SOC 2 Type II Security Certification"
    console.log('🛡️   Setting up SOC 2 Milestone Phases...');
    const soc2Proj = projMap.get('SOC 2 Type II Security Certification')!;

    const phaseDefs = [
      {
        name: 'Phase 1: Gap Analysis & Policy Writing',
        position: 1,
        status: 'completed' as const,
        start: daysAgo(60),
        end: daysAgo(40),
      },
      {
        name: 'Phase 2: Technical Controls & Key Rotation',
        position: 2,
        status: 'active' as const,
        start: daysAgo(40),
        end: daysAgo(10),
      },
      {
        name: 'Phase 3: Independent Penetration Testing',
        position: 3,
        status: 'not_started' as const,
        start: daysAgo(10),
        end: daysAgo(-10),
      },
      {
        name: 'Phase 4: Final Auditor Observation Window',
        position: 4,
        status: 'not_started' as const,
        start: daysAgo(-10),
        end: daysAgo(-40),
      },
    ];

    const phaseMap = new Map<string, string>();
    for (const p of phaseDefs) {
      let [dbP] = await db
        .select()
        .from(phases)
        .where(sql`project_id = ${soc2Proj.id} AND name = ${p.name}`)
        .limit(1);

      if (!dbP) {
        [dbP] = await db
          .insert(phases)
          .values({
            projectId: soc2Proj.id,
            name: p.name,
            position: p.position,
            status: p.status,
            startDate: toISODate(p.start),
            endDate: toISODate(p.end),
          })
          .returning();
      }
      phaseMap.set(p.name, dbP!.id);
    }

    // 8. Seed 120+ Rich Realistic Cards Spanning 60 Days History
    console.log('🃏  Generating 120+ Realistic Cards with Checklists, Comments & Time Logs...');

    interface CardSeedInput {
      projectName: string;
      listName: string;
      title: string;
      description: string;
      storyPoints?: number;
      estimateMinutes?: number;
      dueDate?: Date;
      assigneeEmails: string[];
      watcherEmails?: string[];
      labels: string[];
      sprintName?: string;
      phaseName?: string;
      checklists?: {
        title: string;
        items: { text: string; isDone: boolean; assignedTo?: string }[];
      }[];
      comments?: { authorEmail: string; body: string; daysAgo: number }[];
      timeLogs?: {
        userEmail: string;
        minutes: number;
        description: string;
        daysAgo: number;
        isBillable?: boolean;
      }[];
    }

    const CARDS_DATA: CardSeedInput[] = [
      // ── Core Web App Sprint 24 (Done) ──
      {
        projectName: 'Boardly Core Web App (v2.0)',
        listName: 'Done',
        title: 'Architect WebSocket connection lifecycle and reconnection backoff',
        description:
          '### Context\nImplement resilient full-duplex WebSocket stream handler using Bun native WebSocket server.\n\n### Acceptance Criteria\n- [x] Exponential backoff with jitter on reconnect\n- [x] Heartbeat ping/pong every 30 seconds\n- [x] Token refresh on auth expiration during active stream',
        storyPoints: 8,
        estimateMinutes: 480,
        dueDate: daysAgo(48),
        assigneeEmails: ['elena.rostova@acme.corp', 'leo.thorne@acme.corp'],
        watcherEmails: ['alex.vance@acme.corp', 'felix.zhang@acme.corp'],
        labels: ['Backend', 'Feature', 'DevOps & Infra'],
        sprintName: 'Sprint 24 — Foundation & Real-time Core',
        checklists: [
          {
            title: 'Implementation Milestones',
            items: [
              {
                text: 'WebSocket server plugin with Elysia.js',
                isDone: true,
                assignedTo: 'leo.thorne@acme.corp',
              },
              {
                text: 'Heartbeat protocol and stale socket eviction',
                isDone: true,
                assignedTo: 'elena.rostova@acme.corp',
              },
              {
                text: 'Load test with 10,000 concurrent simulated clients',
                isDone: true,
                assignedTo: 'felix.zhang@acme.corp',
              },
            ],
          },
        ],
        comments: [
          {
            authorEmail: 'elena.rostova@acme.corp',
            body: 'Initial WebSocket connection pooling benchmarks look fantastic. Handling 12k concurrent connections under 85MB memory on Bun.',
            daysAgo: 52,
          },
          {
            authorEmail: 'alex.vance@acme.corp',
            body: 'Incredible performance numbers, great work Elena and Leo!',
            daysAgo: 50,
          },
        ],
        timeLogs: [
          {
            userEmail: 'leo.thorne@acme.corp',
            minutes: 360,
            description: 'Built WebSocket server adapter and connection room manager',
            daysAgo: 54,
            isBillable: true,
          },
          {
            userEmail: 'elena.rostova@acme.corp',
            minutes: 240,
            description: 'Benchmarking socket memory footprint & ping/pong',
            daysAgo: 50,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'Boardly Core Web App (v2.0)',
        listName: 'Done',
        title: 'Design database schema for RBAC permissions & organization multi-tenancy',
        description:
          '### Overview\nNormalize database tables for users, organizations, workspaces, projects, boards, cards, and granular role permissions.\n\n### Deliverables\n- Drizzle ORM schema with foreign keys and cascade rules\n- PostgreSQL migration snapshots\n- Unique constraint verification on system roles',
        storyPoints: 5,
        estimateMinutes: 300,
        dueDate: daysAgo(52),
        assigneeEmails: ['benjamin.cole@acme.corp', 'leo.thorne@acme.corp'],
        labels: ['Backend', 'DevOps & Infra'],
        sprintName: 'Sprint 24 — Foundation & Real-time Core',
        checklists: [
          {
            title: 'Schema Requirements',
            items: [
              { text: 'Unique index on system role names', isDone: true },
              { text: 'Organization member status enum support', isDone: true },
              { text: 'Card watchers and participant many-to-many junction tables', isDone: true },
            ],
          },
        ],
        comments: [
          {
            authorEmail: 'benjamin.cole@acme.corp',
            body: 'All 18 table schemas defined and indexed. Drizzle migrations generated cleanly.',
            daysAgo: 56,
          },
        ],
        timeLogs: [
          {
            userEmail: 'benjamin.cole@acme.corp',
            minutes: 300,
            description: 'Schema modeling and foreign key relationship auditing',
            daysAgo: 56,
            isBillable: true,
          },
        ],
      },

      // ── Core Web App Sprint 25 (Done) ──
      {
        projectName: 'Boardly Core Web App (v2.0)',
        listName: 'Done',
        title: 'Build Optimistic UI drag-and-drop Kanban card board with re-ordering',
        description:
          '### Goal\nUltra-smooth 60fps card movement across columns with position floating-point interpolation (`Lexorank` algorithm).\n\n### Tech Specs\n- `@hello-pangea/dnd` or custom HTML5 Drag and Drop\n- Instant optimistic layout update before server acknowledgment\n- Revert rollback with toast notification on network drop',
        storyPoints: 8,
        estimateMinutes: 480,
        dueDate: daysAgo(35),
        assigneeEmails: ['aria.montgomery@acme.corp', 'chloe.bennett@acme.corp'],
        watcherEmails: ['marcus.brody@acme.corp', 'clara.oswald@acme.corp'],
        labels: ['Frontend', 'Feature', 'Design'],
        sprintName: 'Sprint 25 — Kanban DND & Drag Interactions',
        checklists: [
          {
            title: 'Interaction Checklist',
            items: [
              {
                text: 'Smooth card tilt animation during drag preview',
                isDone: true,
                assignedTo: 'aria.montgomery@acme.corp',
              },
              {
                text: 'List boundary auto-scroll on vertical hover',
                isDone: true,
                assignedTo: 'chloe.bennett@acme.corp',
              },
              {
                text: 'Optimistic state dispatch to TanStack React Query cache',
                isDone: true,
                assignedTo: 'aria.montgomery@acme.corp',
              },
            ],
          },
        ],
        comments: [
          {
            authorEmail: 'clara.oswald@acme.corp',
            body: 'The card tilt angle and spring physics feel super responsive!',
            daysAgo: 38,
          },
          {
            authorEmail: 'aria.montgomery@acme.corp',
            body: 'Optimistic rollback works seamlessly even in simulated 3G network conditions.',
            daysAgo: 36,
          },
        ],
        timeLogs: [
          {
            userEmail: 'aria.montgomery@acme.corp',
            minutes: 420,
            description: 'Implemented optimistic DND list repositioning & TanStack cache updater',
            daysAgo: 38,
            isBillable: true,
          },
          {
            userEmail: 'chloe.bennett@acme.corp',
            minutes: 180,
            description: 'Micro-animations and drag shadow styling',
            daysAgo: 36,
            isBillable: true,
          },
        ],
      },

      // ── Core Web App Sprint 26 (Active Sprint) ──
      {
        projectName: 'Boardly Core Web App (v2.0)',
        listName: 'In Progress',
        title: 'Implement Card Watchers subscription & granular real-time broadcast',
        description:
          '### Feature\nAllow users to "Watch" cards to receive notification updates whenever assignees, stage, labels, or checklists change.\n\n### Tasks\n- `POST /v1/cards/:id/watch` & `DELETE /v1/cards/:id/watch`\n- WebSocket event broadcast `card.watched` / `card.unwatched`\n- Card modal avatar stack with eye badge indicator',
        storyPoints: 5,
        estimateMinutes: 300,
        dueDate: daysAgo(-3),
        assigneeEmails: ['leo.thorne@acme.corp', 'lucas.dupont@acme.corp'],
        watcherEmails: ['elena.rostova@acme.corp'],
        labels: ['Backend', 'Frontend', 'Feature'],
        sprintName: 'Sprint 26 — Enterprise RBAC & Notification Hub',
        checklists: [
          {
            title: 'Watcher Flow',
            items: [
              {
                text: 'Backend watcher service with database queries',
                isDone: true,
                assignedTo: 'leo.thorne@acme.corp',
              },
              {
                text: 'Unit tests for card watching and duplicate prevention',
                isDone: true,
                assignedTo: 'leo.thorne@acme.corp',
              },
              {
                text: 'Frontend Watch button with eye toggle in CardDetailDialog',
                isDone: false,
                assignedTo: 'lucas.dupont@acme.corp',
              },
            ],
          },
        ],
        comments: [
          {
            authorEmail: 'leo.thorne@acme.corp',
            body: 'Backend service and routes completed with 100% test coverage. Ready for UI hookup.',
            daysAgo: 2,
          },
        ],
        timeLogs: [
          {
            userEmail: 'leo.thorne@acme.corp',
            minutes: 240,
            description: 'Built card watcher service endpoints & event dispatcher',
            daysAgo: 2,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'Boardly Core Web App (v2.0)',
        listName: 'In Review / QA',
        title: 'Time tracking breakdown analytics & CSV report exporter',
        description:
          '### Requirement\nExport organization timesheets grouped by User, Project, Card, and Billable status.\n\n### Acceptance Criteria\n- Date range picker (This Week, Last 30 Days, Custom)\n- CSV export streaming download\n- Burndown billable vs non-billable chart',
        storyPoints: 5,
        estimateMinutes: 360,
        dueDate: daysAgo(1),
        assigneeEmails: ['zara.patel@acme.corp', 'harper.lee@acme.corp'],
        labels: ['Frontend', 'Backend', 'Feature'],
        sprintName: 'Sprint 26 — Enterprise RBAC & Notification Hub',
        checklists: [
          {
            title: 'QA Test Scenarios',
            items: [
              { text: 'CSV formatting with special characters & comma escaping', isDone: true },
              { text: 'Role-based permission check (viewers cannot edit time logs)', isDone: true },
              { text: 'Timesheet aggregate sums match database records', isDone: true },
            ],
          },
        ],
        comments: [
          {
            authorEmail: 'zara.patel@acme.corp',
            body: 'QA regression testing passed for time log filtering and CSV exports.',
            daysAgo: 1,
          },
        ],
        timeLogs: [
          {
            userEmail: 'harper.lee@acme.corp',
            minutes: 300,
            description: 'Built timesheet aggregation service & CSV streaming parser',
            daysAgo: 3,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'Boardly Core Web App (v2.0)',
        listName: 'To Do',
        title: 'Implement Command Palette (Cmd+K) quick card search and stage jumping',
        description:
          'Global keyboard navigation modal allowing instant search across cards, boards, projects, and users with arrow key selection.',
        storyPoints: 3,
        estimateMinutes: 180,
        dueDate: daysAgo(-5),
        assigneeEmails: ['nadia.kaminski@acme.corp', 'aria.montgomery@acme.corp'],
        labels: ['Frontend', 'Design'],
        sprintName: 'Sprint 26 — Enterprise RBAC & Notification Hub',
      },
      {
        projectName: 'Boardly Core Web App (v2.0)',
        listName: 'Backlog',
        title: 'Integrate Webhooks dispatch engine with retry exponential backoff',
        description:
          'Outbound webhook dispatcher supporting HMAC SHA-256 signature verification and auto-disable after 10 consecutive failures.',
        storyPoints: 5,
        estimateMinutes: 300,
        assigneeEmails: ['felix.zhang@acme.corp'],
        labels: ['Backend', 'Feature'],
        sprintName: 'Sprint 27 — Mobile Offline Sync & Automation Rules',
      },

      // ── Cloud Infrastructure & Kubernetes Architecture ──
      {
        projectName: 'Cloud Infrastructure & Kubernetes Architecture',
        listName: 'Done',
        title: 'Provision multi-region AWS EKS cluster with Terraform IAC',
        description:
          '### Infrastructure as Code\nAutomated Terraform modules provisioning VPC, public/private subnets, NAT gateways, EKS cluster v1.31, and Managed Node Groups with auto-scaling.',
        storyPoints: 8,
        estimateMinutes: 480,
        dueDate: daysAgo(42),
        assigneeEmails: ['maya.lin@acme.corp', 'oliver.queen@acme.corp'],
        labels: ['DevOps & Infra', 'Security'],
        timeLogs: [
          {
            userEmail: 'maya.lin@acme.corp',
            minutes: 480,
            description: 'Terraform EKS cluster provisioning & IAM OIDC role mapping',
            daysAgo: 45,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'Cloud Infrastructure & Kubernetes Architecture',
        listName: 'In Progress',
        title: 'Configure Prometheus & Grafana cluster monitoring dashboards with PagerDuty',
        description:
          'Cluster health metrics, CPU/memory pressure alerts, HTTP 5xx error rate thresholds, and WebSocket connection saturation gauges.',
        storyPoints: 5,
        estimateMinutes: 300,
        dueDate: daysAgo(-2),
        assigneeEmails: ['oliver.queen@acme.corp', 'maya.lin@acme.corp'],
        labels: ['DevOps & Infra'],
        timeLogs: [
          {
            userEmail: 'oliver.queen@acme.corp',
            minutes: 240,
            description: 'Configured Grafana alerting rules and latency SLI monitors',
            daysAgo: 4,
            isBillable: true,
          },
        ],
      },

      // ── Mobile Apps Suite (iOS & Android) ──
      {
        projectName: 'Mobile Apps Suite (iOS & Android)',
        listName: 'In Progress',
        title: 'Implement offline-first SQLite synchronization for mobile card editing',
        description:
          'Allow team members on the go to edit cards, check off checklist items, and create comments while offline, syncing on network reconnection.',
        storyPoints: 8,
        estimateMinutes: 480,
        dueDate: daysAgo(-4),
        assigneeEmails: ['sofia.reyes@acme.corp', 'isla.morales@acme.corp'],
        labels: ['Frontend', 'Feature'],
        timeLogs: [
          {
            userEmail: 'sofia.reyes@acme.corp',
            minutes: 360,
            description: 'Built SQLite offline queue and conflict resolver for mobile client',
            daysAgo: 6,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'Mobile Apps Suite (iOS & Android)',
        listName: 'Done',
        title: 'Setup Expo push notifications for instant card assignment alerts',
        description:
          'Configured APNs and FCM push credentials for instant push notifications when a user is assigned to a card or @mentioned in a comment.',
        storyPoints: 5,
        estimateMinutes: 240,
        dueDate: daysAgo(20),
        assigneeEmails: ['isla.morales@acme.corp'],
        labels: ['Frontend', 'Backend'],
        timeLogs: [
          {
            userEmail: 'isla.morales@acme.corp',
            minutes: 240,
            description: 'Push notification device token registration & dispatch worker',
            daysAgo: 22,
            isBillable: true,
          },
        ],
      },

      // ── Design System & Glassmorphic UI 2.0 ──
      {
        projectName: 'Design System & Glassmorphic UI 2.0',
        listName: 'Done',
        title: 'Build Shadcn UI Sidebar primitives with collapsible mobile drawer',
        description:
          'Official sidebar component architecture supporting pinned desktop navigation, keyboard shortcut `Cmd+B`, and fixed header viewport containment.',
        storyPoints: 5,
        estimateMinutes: 300,
        dueDate: daysAgo(5),
        assigneeEmails: ['clara.oswald@acme.corp', 'freya.lind@acme.corp'],
        labels: ['Design', 'Frontend'],
        timeLogs: [
          {
            userEmail: 'freya.lind@acme.corp',
            minutes: 300,
            description: 'Built Shadcn Sidebar components & responsive layout tests',
            daysAgo: 5,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'Design System & Glassmorphic UI 2.0',
        listName: 'In Review / QA',
        title: 'WCAG AAA contrast audit and accessible dark mode elevation shadows',
        description:
          'Comprehensive color token contrast validation ensuring 7:1 ratio for text and crisp border separation in dark mode.',
        storyPoints: 3,
        estimateMinutes: 180,
        dueDate: daysAgo(0),
        assigneeEmails: ['valerie.pierce@acme.corp', 'freya.lind@acme.corp'],
        labels: ['Design'],
        timeLogs: [
          {
            userEmail: 'valerie.pierce@acme.corp',
            minutes: 180,
            description: 'Figma token alignment & contrast checker audits',
            daysAgo: 2,
            isBillable: true,
          },
        ],
      },

      // ── Q3 Global Product Launch Campaign ──
      {
        projectName: 'Q3 Global Product Launch Campaign',
        listName: 'In Progress',
        title: 'Produce high-converting interactive product demo & interactive sandbox walkthrough',
        description:
          'Interactive embeddable demo showing live Kanban board, sprint burndown, and time tracking in under 60 seconds.',
        storyPoints: 5,
        estimateMinutes: 360,
        dueDate: daysAgo(-10),
        assigneeEmails: [
          'sarah.chen@acme.corp',
          'gabriel.rossi@acme.corp',
          'lily.collins@acme.corp',
        ],
        labels: ['Feature', 'Design'],
        timeLogs: [
          {
            userEmail: 'gabriel.rossi@acme.corp',
            minutes: 300,
            description: 'Designed interactive product walkthrough storyboard',
            daysAgo: 4,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'Q3 Global Product Launch Campaign',
        listName: 'Done',
        title: 'Launch Product Hunt & Hacker News Show submission assets',
        description:
          'Hero artwork, teaser GIF animations, founder comment copy, and maker comment schedule.',
        storyPoints: 3,
        estimateMinutes: 180,
        dueDate: daysAgo(15),
        assigneeEmails: ['emma.watson@acme.corp', 'lily.collins@acme.corp'],
        labels: ['Design'],
        timeLogs: [
          {
            userEmail: 'emma.watson@acme.corp',
            minutes: 180,
            description: 'Copywriting launch announcement post & email blast',
            daysAgo: 16,
            isBillable: true,
          },
        ],
      },

      // ── SOC 2 Type II Security Certification ──
      {
        projectName: 'SOC 2 Type II Security Certification',
        listName: 'Done',
        title: 'Enforce AES-256 encryption at rest and TLS 1.3 in transit',
        description:
          'Verified database volume encryption, automated AWS KMS master key rotation, and strict HTTPS HSTS headers.',
        storyPoints: 8,
        estimateMinutes: 420,
        dueDate: daysAgo(35),
        assigneeEmails: ['ethan.hunt@acme.corp', 'nathan.drake@acme.corp'],
        labels: ['Security', 'DevOps & Infra'],
        phaseName: 'Phase 1: Gap Analysis & Policy Writing',
        timeLogs: [
          {
            userEmail: 'ethan.hunt@acme.corp',
            minutes: 420,
            description: 'Configured automated KMS key rotation & TLS 1.3 ciphers',
            daysAgo: 36,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'SOC 2 Type II Security Certification',
        listName: 'In Progress',
        title: 'Complete annual third-party penetration test and remediate findings',
        description:
          'External red team penetration testing against REST API endpoints, WebSocket streams, and authentication tokens.',
        storyPoints: 8,
        estimateMinutes: 480,
        dueDate: daysAgo(-8),
        assigneeEmails: ['nathan.drake@acme.corp', 'ethan.hunt@acme.corp'],
        watcherEmails: ['harrison.wells@auditor.compliance.org', 'david.sterling@acme.corp'],
        labels: ['Security', 'P0 Blocker'],
        phaseName: 'Phase 2: Technical Controls & Key Rotation',
        timeLogs: [
          {
            userEmail: 'nathan.drake@acme.corp',
            minutes: 300,
            description: 'Auditing penetration test scope and coordinating red team access',
            daysAgo: 7,
            isBillable: true,
          },
        ],
      },

      // ── Enterprise Tier Onboarding & SLA Desk ──
      {
        projectName: 'Enterprise Tier Onboarding & SLA Desk',
        listName: 'In Progress',
        title: 'Configure Okta & Azure AD SAML Single Sign-On for Fortune 500 client',
        description:
          'Implement enterprise SSO directory synchronization and Just-In-Time (JIT) provisioning for 1,500 enterprise seats.',
        storyPoints: 5,
        estimateMinutes: 300,
        dueDate: daysAgo(-2),
        assigneeEmails: [
          'priya.sharma@acme.corp',
          'dominic.toretto@acme.corp',
          'gavin.belson@acme.corp',
        ],
        labels: ['Security', 'Feature'],
        timeLogs: [
          {
            userEmail: 'gavin.belson@acme.corp',
            minutes: 240,
            description: 'Configured SAML metadata exchange and SCIM provisioning testing',
            daysAgo: 3,
            isBillable: true,
          },
        ],
      },
      {
        projectName: 'Enterprise Tier Onboarding & SLA Desk',
        listName: 'Done',
        title: 'Build automated 99.99% uptime status page with incident post-mortem hub',
        description:
          'Public and private customer status dashboards with real-time latency graphs and incident notification subscriptions.',
        storyPoints: 5,
        estimateMinutes: 240,
        dueDate: daysAgo(25),
        assigneeEmails: ['simon.riley@acme.corp', 'elena.gilbert@acme.corp'],
        labels: ['Feature', 'DevOps & Infra'],
        timeLogs: [
          {
            userEmail: 'simon.riley@acme.corp',
            minutes: 240,
            description: 'Built status page frontend & automated ping monitor probe',
            daysAgo: 28,
            isBillable: true,
          },
        ],
      },
    ];

    // Insert all predefined cards + generate additional cards to exceed 120 total cards
    let totalCardsCount = 0;

    for (const cInput of CARDS_DATA) {
      const pInfo = projMap.get(cInput.projectName);
      if (!pInfo) continue;

      const listId = pInfo.listMap.get(cInput.listName) || Array.from(pInfo.listMap.values())[0]!;

      let [card] = await db
        .select()
        .from(cards)
        .where(sql`organization_id = ${org!.id} AND title = ${cInput.title}`)
        .limit(1);

      if (!card) {
        totalCardsCount++;
        pInfo.taskCounter += 1;
        const taskNumber = pInfo.taskCounter;
        const cardKey = `${pInfo.key}-${taskNumber}`;

        [card] = await db
          .insert(cards)
          .values({
            organizationId: org!.id,
            listId,
            taskNumber,
            key: cardKey,
            title: cInput.title,
            description: cInput.description,
            position: totalCardsCount * 1000,
            dueDate: cInput.dueDate || daysAgo(-7),
            storyPoints: cInput.storyPoints || 3,
            estimateMinutes: cInput.estimateMinutes || 180,
            createdAt: cInput.dueDate ? daysAgo(40) : daysAgo(10),
          })
          .returning();
      }

      // Assignees
      for (const email of cInput.assigneeEmails) {
        const uId = getUser(email);
        await db
          .insert(cardAssignees)
          .values({ cardId: card!.id, userId: uId })
          .onConflictDoNothing();
        await db
          .insert(cardParticipants)
          .values({ cardId: card!.id, userId: uId })
          .onConflictDoNothing();
      }

      // Watchers
      if (cInput.watcherEmails) {
        for (const email of cInput.watcherEmails) {
          const uId = getUser(email);
          await db
            .insert(cardWatchers)
            .values({ cardId: card!.id, userId: uId })
            .onConflictDoNothing();
        }
      }

      // Labels
      for (const lName of cInput.labels) {
        const lblId = pInfo.labelMap.get(lName);
        if (lblId) {
          await db
            .insert(cardLabels)
            .values({ cardId: card!.id, labelId: lblId })
            .onConflictDoNothing();
        }
      }

      // Sprints
      if (cInput.sprintName && sprintMap.has(cInput.sprintName)) {
        const sId = sprintMap.get(cInput.sprintName)!;
        await db
          .insert(cardSprints)
          .values({ cardId: card!.id, sprintId: sId })
          .onConflictDoNothing();
      }

      // Phases
      if (cInput.phaseName && phaseMap.has(cInput.phaseName)) {
        const phId = phaseMap.get(cInput.phaseName)!;
        await db
          .insert(cardPhase)
          .values({ cardId: card!.id, phaseId: phId })
          .onConflictDoNothing();
      }

      // Checklists
      if (cInput.checklists) {
        for (const chk of cInput.checklists) {
          const [dbChk] = await db
            .insert(checklists)
            .values({ cardId: card!.id, title: chk.title, position: 1000 })
            .returning();

          if (dbChk) {
            for (let idx = 0; idx < chk.items.length; idx++) {
              const item = chk.items[idx]!;
              await db.insert(checklistItems).values({
                checklistId: dbChk.id,
                text: item.text,
                isDone: item.isDone,
                position: (idx + 1) * 1000,
                assignedTo: item.assignedTo ? getUser(item.assignedTo) : undefined,
              });
            }
          }
        }
      }

      // Comments
      if (cInput.comments) {
        for (const cm of cInput.comments) {
          const uId = getUser(cm.authorEmail);
          await db.insert(comments).values({
            cardId: card!.id,
            userId: uId,
            body: cm.body,
            createdAt: daysAgo(cm.daysAgo),
          });
        }
      }

      // Time Logs
      if (cInput.timeLogs) {
        for (const tl of cInput.timeLogs) {
          const uId = getUser(tl.userEmail);
          await db.insert(timeLogs).values({
            cardId: card!.id,
            userId: uId,
            minutes: tl.minutes,
            description: tl.description,
            loggedDate: toISODate(daysAgo(tl.daysAgo)),
            isBillable: tl.isBillable ?? true,
            createdAt: daysAgo(tl.daysAgo),
          });
        }
      }
    }

    // Generate auxiliary cards to reach 120+ total realistic cards across boards
    console.log('⚡  Populating remaining cards across all project boards...');
    const genericTopics = [
      {
        title: 'Implement dark mode theme switcher with system preference detection',
        label: 'Frontend',
        sp: 3,
      },
      {
        title: 'Add rate limiting header middleware using Token Bucket algorithm',
        label: 'Backend',
        sp: 5,
      },
      { title: 'Fix CSS z-index stacking context on modal dropdown menus', label: 'Bug', sp: 2 },
      {
        title: 'Audit npm dependency vulnerabilities and update outdated sub-packages',
        label: 'Security',
        sp: 3,
      },
      {
        title: 'Write comprehensive integration test suite for /v1/organizations routes',
        label: 'Backend',
        sp: 5,
      },
      {
        title: 'Refactor CardDetailDialog into modular sub-tabs (Activity, Time, Attachments)',
        label: 'Frontend',
        sp: 5,
      },
      {
        title: 'Optimize Postgres query planner with compound index on (org_id, deleted_at)',
        label: 'DevOps & Infra',
        sp: 5,
      },
      {
        title: 'Create interactive user onboarding tooltip tour for newly created boards',
        label: 'Design',
        sp: 3,
      },
      {
        title: 'Implement automatic card archiving rule for cards done over 30 days',
        label: 'Feature',
        sp: 3,
      },
      {
        title: 'Add support for GIF cover images with lazy loading intersection observer',
        label: 'Frontend',
        sp: 2,
      },
      {
        title: 'Build export burndown chart as high-resolution PNG for stakeholder presentations',
        label: 'Feature',
        sp: 3,
      },
      {
        title: 'Refactor Elysia error handler to return standardized RFC 7807 problem details',
        label: 'Backend',
        sp: 3,
      },
    ];

    for (const [projName, pInfo] of projMap.entries()) {
      const listIds = Array.from(pInfo.listMap.values());
      for (let i = 0; i < genericTopics.length; i++) {
        const topic = genericTopics[i]!;
        const listId = listIds[i % listIds.length]!;
        const cardTitle = `[${projName.split(' ')[0]}] ${topic.title}`;

        const existingCard = await db
          .select({ id: cards.id })
          .from(cards)
          .where(sql`organization_id = ${org!.id} AND title = ${cardTitle}`)
          .limit(1);

        if (existingCard.length === 0) {
          totalCardsCount++;
          pInfo.taskCounter += 1;
          const taskNumber = pInfo.taskCounter;
          const cardKey = `${pInfo.key}-${taskNumber}`;

          const randomDays = Math.floor(Math.random() * 50) + 1;
          const [c] = await db
            .insert(cards)
            .values({
              organizationId: org!.id,
              listId,
              taskNumber,
              key: cardKey,
              title: cardTitle,
              description: `Automated task breakdown for ${projName}.\n\n### Requirements\n- Ensure unit test coverage.\n- Verified against production load tests.`,
              position: totalCardsCount * 1000,
              dueDate: daysAgo(randomDays > 25 ? randomDays - 25 : -14),
              storyPoints: topic.sp,
              estimateMinutes: topic.sp * 60,
              createdAt: daysAgo(randomDays),
            })
            .returning();

          if (c) {
            const assigneeId = allUserIds[totalCardsCount % allUserIds.length]!;
            await db
              .insert(cardAssignees)
              .values({ cardId: c.id, userId: assigneeId })
              .onConflictDoNothing();

            // Time log
            await db.insert(timeLogs).values({
              cardId: c.id,
              userId: assigneeId,
              minutes: (Math.floor(Math.random() * 4) + 1) * 60,
              description: `Progress work on ${topic.title}`,
              loggedDate: toISODate(daysAgo(randomDays)),
              isBillable: Math.random() > 0.3,
              createdAt: daysAgo(randomDays),
            });
          }
        }
      }
    }

    // Update taskCounter on all seeded projects
    for (const pInfo of projMap.values()) {
      await db
        .update(projects)
        .set({ taskCounter: pInfo.taskCounter, key: pInfo.key })
        .where(eq(projects.id, pInfo.id));
    }

    // 9. Docs & Wikis
    console.log('📚  Creating Engineering Knowledge Base & Docs...');
    const docDefs = [
      {
        title: 'Engineering Onboarding & Git Workflow Guide',
        slug: 'engineering-onboarding',
        content:
          '# Engineering Onboarding\n\nWelcome to Acme Technologies! All repositories use Turborepo and Bun.\n\n## Branching Strategy\n- `main` is protected and always deployable.\n- Feature branches: `feat/feature-name`\n- Bug fixes: `fix/bug-name`\n\n## PR Requirements\n1. At least 1 peer approval.\n2. All unit tests green (`bun test`).\n3. Zero linter warnings.',
        author: 'elena.rostova@acme.corp',
        projectName: 'Boardly Core Web App (v2.0)',
      },
      {
        title: 'Architecture RFC: Microservices & Real-time WebSockets',
        slug: 'architecture-rfc-websockets',
        content:
          '# RFC 004: Real-time Sync Protocol\n\nThis RFC documents the design decisions for Boardly real-time synchronization over WebSockets.\n\n## Event Types\n- `card.created`\n- `card.moved`\n- `card.watched`\n- `comment.added`',
        author: 'liam.gallagher@acme.corp',
        projectName: 'Boardly Core Web App (v2.0)',
      },
      {
        title: 'Incident Response & Disaster Recovery Playbook',
        slug: 'incident-response-playbook',
        content:
          '# Incident Response Playbook\n\nSeverity 0 / 1 incident escalation hierarchy:\n1. On-call SRE paged via PagerDuty.\n2. Incident Commander assigned.\n3. Dedicated Slack war-room `#incident-war-room`.\n4. Executive notification within 15 minutes.',
        author: 'maya.lin@acme.corp',
        projectName: 'Cloud Infrastructure & Kubernetes Architecture',
      },
    ];

    for (const doc of docDefs) {
      const pInfo = projMap.get(doc.projectName);
      if (!pInfo) continue;
      const authorId = getUser(doc.author);

      const existingDoc = await db
        .select({ id: documents.id })
        .from(documents)
        .where(sql`organization_id = ${org!.id} AND slug = ${doc.slug}`)
        .limit(1);

      if (existingDoc.length === 0) {
        await db.insert(documents).values({
          organizationId: org!.id,
          projectId: pInfo.id,
          title: doc.title,
          slug: doc.slug,
          content: doc.content,
          authorId,
        });
      }
    }

    // 10. Intake Forms
    console.log('📝  Creating Bug & Feature Intake Forms...');
    const firstBoard = Array.from(projMap.values())[0]!;
    const firstList = Array.from(firstBoard.listMap.values())[0]!;

    const existingForm = await db
      .select({ id: intakeForms.id })
      .from(intakeForms)
      .where(sql`organization_id = ${org!.id} AND slug = 'acme-bug-intake'`)
      .limit(1);

    if (existingForm.length === 0) {
      await db.insert(intakeForms).values({
        organizationId: org!.id,
        boardId: firstBoard.boardId,
        listId: firstList,
        title: 'Customer Bug & Issue Triage Form',
        description:
          'Report unexpected behavior or bugs directly to the Acme engineering triage queue.',
        slug: 'acme-bug-intake',
        isPublished: true,
        slaHours: 24,
        defaultAssigneeId: getUser('zara.patel@acme.corp'),
      });
    }

    // 11. Activity & Audit History
    console.log('📜  Logging Audit Events & Activity Trail...');
    for (let i = 0; i < 30; i++) {
      const actorId = allUserIds[i % allUserIds.length]!;
      const pastDays = Math.floor(Math.random() * 55) + 1;

      await db.insert(auditLog).values({
        organizationId: org!.id,
        actorId,
        action: i % 2 === 0 ? 'card.moved' : 'member.role.update',
        target: i % 2 === 0 ? 'Card: Architecture Refactor' : 'User: Role Elevation',
        createdAt: daysAgo(pastDays),
      });

      await db.insert(activityLog).values({
        organizationId: org!.id,
        entityType: 'card',
        entityId: actorId,
        actorId,
        action: 'card.status.updated',
        createdAt: daysAgo(pastDays),
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅  ACME TECHNOLOGIES SEEDING COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`• Organization: Acme Technologies (slug: acme-corp)`);
    console.log(`• Plan: Enterprise Tier (Active)`);
    console.log(`• Total Members: 50 Users`);
    console.log(`• Workspaces: 5 Departments`);
    console.log(`• Projects: 8 Active/Scrum/Kanban Projects`);
    console.log(`• Sprints: 4 Sprints across 60 days history`);
    console.log(`• Cards: 120+ Detailed Cards with Checklists & Time Tracking`);
    console.log(`• Standard Password: Password123!`);
    console.log('═══════════════════════════════════════════════════════════════\n');
  } finally {
    await client.end();
  }
}

// Direct execution
if (import.meta.main) {
  await seedFullOrganization(process.argv.includes('--force'));
  process.exit(0);
}
