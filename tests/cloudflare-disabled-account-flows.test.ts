import { describe, expect, it } from 'vitest';
import { POST as start } from '@/app/api/setup/start/route';
import { POST as token } from '@/app/api/auth/token/route';
import { POST as link } from '@/app/api/accounts/link-caretaker/route';
import { POST as gift } from '@/app/api/gift-codes/redeem/route';

describe('personal Worker never exposes unported interactive transactions', () => {
  it('rejects setup and billing independently of upstream activation flags', async () => {
    const oldMode = process.env.DEPLOYMENT_MODE;
    const oldSetup = process.env.ALLOW_FAMILY_SETUP;
    process.env.DEPLOYMENT_MODE = 'saas';
    process.env.ALLOW_FAMILY_SETUP = 'true';
    try {
      for (const [handler, status] of [[start,403],[token,403],[link,501],[gift,403]] as const) {
        const response = await handler();
        expect(response.status).toBe(status);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error).toMatch(/Cloudflare deployment/);
      }
    } finally {
      process.env.DEPLOYMENT_MODE = oldMode;
      if (oldSetup === undefined) delete process.env.ALLOW_FAMILY_SETUP;
      else process.env.ALLOW_FAMILY_SETUP = oldSetup;
    }
  });
});
