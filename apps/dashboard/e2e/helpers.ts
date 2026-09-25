import { expect, type Page, type APIRequestContext } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/v1';
export const PASSWORD = 'Password123!';

export const PERSONAS = {
  owner: { name: 'Alex Vance', email: 'alex.vance@acme.corp' },
  admin: { name: 'Elena Rostova', email: 'elena.rostova@acme.corp' },
  member: { name: 'Leo Thorne', email: 'leo.thorne@acme.corp' },
  viewer: { name: 'Dr. Raymond Vance', email: 'raymond.vance@board.acme.corp' },
} as const;

export type PersonaKey = keyof typeof PERSONAS;

/** UI login via the dashboard login form. */
export async function loginAs(page: Page, persona: PersonaKey): Promise<void> {
  const { email } = PERSONAS[persona];
  await page.goto('/login');
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).not.toHaveURL(/login/, { timeout: 15000 });
}

/** Direct API sign-in (fast setup/teardown without UI). */
export async function apiSignIn(
  request: APIRequestContext,
  email: string
): Promise<{ accessToken: string; userId: string }> {
  const res = await request.post(`${API_URL}/auth/sign-in`, {
    data: { email, password: PASSWORD },
  });
  if (!res.ok()) throw new Error(`apiSignIn failed for ${email}: ${res.status()}`);
  const body = await res.json();
  return { accessToken: body.accessToken, userId: body.user?.id };
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
