import { describe, it, expect, afterAll } from 'bun:test';
import { assertSafeWebhookUrl } from './service';
import { env } from '../../lib/env';

/**
 * SSRF guard contract: loopback, RFC1918, link-local/metadata and non-http(s)
 * targets are refused at registration AND at dispatch (same validator).
 * Literal IPs resolve without DNS, so these run offline.
 */
describe('webhook SSRF guard', () => {
  const prevFlag = env.ALLOW_HTTP_WEBHOOKS;

  afterAll(() => {
    (env as { ALLOW_HTTP_WEBHOOKS?: boolean }).ALLOW_HTTP_WEBHOOKS = prevFlag;
  });

  it('refuses loopback over https', async () => {
    await expect(assertSafeWebhookUrl('https://127.0.0.1/hook')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refuses RFC1918 ranges', async () => {
    for (const url of [
      'https://10.0.0.5/hook',
      'https://172.16.4.2/hook',
      'https://192.168.1.20/hook',
    ]) {
      await expect(assertSafeWebhookUrl(url)).rejects.toMatchObject({ status: 400 });
    }
  });

  it('refuses link-local/metadata addresses', async () => {
    await expect(
      assertSafeWebhookUrl('https://169.254.169.254/latest/meta-data')
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses plain http without the explicit flag', async () => {
    (env as { ALLOW_HTTP_WEBHOOKS?: boolean }).ALLOW_HTTP_WEBHOOKS = false;
    await expect(assertSafeWebhookUrl('http://127.0.0.1:3000/hook')).rejects.toMatchObject({
      status: 400,
    });
    await expect(assertSafeWebhookUrl('http://localhost:3000/hook')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('allows http loopback only with ALLOW_HTTP_WEBHOOKS=1', async () => {
    (env as { ALLOW_HTTP_WEBHOOKS?: boolean }).ALLOW_HTTP_WEBHOOKS = true;
    const url = await assertSafeWebhookUrl('http://127.0.0.1:3000/hook');
    expect(url.protocol).toBe('http:');
  });

  it('allows public literal IPs', async () => {
    // example.com's v4 literal: public, resolves without DNS.
    const url = await assertSafeWebhookUrl('https://93.184.215.14/hook');
    expect(url.hostname).toBe('93.184.215.14');
  });

  it('refuses credentials and non-http schemes', async () => {
    await expect(assertSafeWebhookUrl('https://user:pass@example.com/hook')).rejects.toMatchObject({
      status: 400,
    });
    await expect(assertSafeWebhookUrl('ftp://example.com/hook')).rejects.toMatchObject({
      status: 400,
    });
  });
});
