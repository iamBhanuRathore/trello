import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Session-resolution and theme-boot contracts (P2-4).
 *
 * authStore conflated three states behind `isAuthenticated`:
 *   1. a stored token not yet verified (boot, pre-checkAuth)
 *   2. verified, with a user (normal)
 *   3. "staying authenticated through a 5xx" (transient outage)
 *
 * (1) flashed the private route before checkAuth resolved, so an expired token
 * showed a frame of app shell. (3) left `isAuthenticated: true` with
 * `user: null`, which silently disabled every query AND emptied the permission
 * set — during an outage the UI rendered as if the user had no permissions.
 * `authResolved` now distinguishes them.
 *
 * Theme: `applyDOMTheme` only ran from an effect, so every reload painted a
 * frame of default light. An inline pre-paint script in index.html fixes that.
 */

const SRC = join(import.meta.dir, '..');
const read = (rel: string) => readFile(join(SRC, rel), 'utf-8');

describe('auth session resolution', () => {
  it('boots unresolved rather than authenticated on a stored token', async () => {
    const src = await read('store/authStore.ts');
    // A token is a hint, not a verified session.
    expect(src).not.toContain('isAuthenticated: !!localStorage.getItem');
    expect(src).toContain('authResolved: !localStorage.getItem');
    expect(src).toContain('// A stored token is a HINT, not a verified session.');
  });

  it('checkAuth marks the session resolved on success', async () => {
    const src = await read('store/authStore.ts');
    const onSuccess = src.slice(
      src.indexOf('const res = await api.get'),
      src.indexOf('} catch (error')
    );
    expect(onSuccess).toContain('authResolved: true');
  });

  it('a 5xx leaves the session UNRESOLVED, not silently authenticated', async () => {
    const src = await read('store/authStore.ts');
    const branch = src.slice(src.indexOf('status === undefined || status >= 500'));
    // The old code set only isLoading:false, leaving isAuthenticated true with a
    // null user. It must stay unresolved so consumers keep waiting.
    expect(branch).toContain('authResolved: false');
    const seg = branch.slice(0, branch.indexOf('}'));
    expect(seg).not.toContain('isAuthenticated: true');
  });

  it('a definitive rejection resolves as signed out', async () => {
    const src = await read('store/authStore.ts');
    const rejection = src.slice(src.indexOf('const currentToken = localStorage.getItem'));
    expect(rejection).toContain('isAuthenticated: false');
    expect(rejection).toContain('authResolved: true');
  });

  it('ProtectedRoute waits for a resolved session', async () => {
    const src = await read('App.tsx');
    const guard = src.slice(src.indexOf('function ProtectedRoute'));
    const seg = guard.slice(0, guard.indexOf('return <>{children}'));
    expect(seg).toContain('authResolved');
    expect(seg).toContain('if (isLoading || !authResolved)');
  });

  it('usePermissions reports loading while the session is unresolved', async () => {
    const src = await read('hooks/usePermissions.ts');
    expect(src).toContain('isLoading: isLoading || !authResolved');
    // Without this, an empty `granted` set made every gated control vanish.
    expect(src).toContain('authResolved = useAuthStore');
  });
});

describe('theme applies before first paint', () => {
  it('index.html sets the theme class before the module bundle runs', async () => {
    const html = await read('../index.html');
    const scriptAt = html.indexOf("localStorage.getItem('boardly_theme_mode')");
    const bundleAt = html.indexOf('src="/src/main.tsx"');
    expect(scriptAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeLessThan(bundleAt);
    expect(html).toContain("classList.add('dark')");
  });

  it('the inline script reads the same storage keys as the store', async () => {
    const html = await read('../index.html');
    const store = await read('store/themeStore.ts');
    for (const [key, name] of [
      ['boardly_theme_mode', 'mode'],
      ['boardly_theme_palette', 'palette'],
    ] as const) {
      expect(html).toContain(key);
      expect(store).toContain(`${name}: '${key}'`);
    }
  });

  it('the inline script cannot import anything', async () => {
    const html = await read('../index.html');
    const start = html.indexOf('<script>');
    const end = html.indexOf('</script>', start);
    const body = html.slice(start, end);
    expect(body).not.toContain('import ');
    expect(body).not.toContain('require(');
  });

  it('the store no longer discards the palette in light mode', async () => {
    const src = await read('store/themeStore.ts');
    expect(src).not.toContain("root.removeAttribute('data-theme')");
  });

  it('selecting a dark-only palette no longer silently flips the mode', async () => {
    const src = await read('store/themeStore.ts');
    const setPalette = src.slice(src.indexOf('setPalette:'), src.indexOf('setAccentId:'));
    // The old branch rewrote mode and persisted it without telling the user.
    expect(setPalette).not.toContain('localStorage.setItem(STORAGE_KEYS.mode, nextMode)');
    expect(setPalette).not.toContain('nextMode');
  });

  it('the modal surfaces the dark-only constraint instead', async () => {
    const src = await read('components/AppearanceModal.tsx');
    expect(src).toContain('preset.isDarkOnly');
    expect(src).toContain('Dark theme');
    expect(src).toContain('aria-describedby');
  });
});
