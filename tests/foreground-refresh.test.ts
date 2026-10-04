import { afterEach, describe, expect, it, vi } from 'vitest';
import { createForegroundRefresh, safeOfflineAssets } from '@/src/lib/offline/foreground-refresh';

describe('shared family foreground refresh', () => {
  afterEach(() => vi.useRealTimers());
  it('shows the other device server change on the next resume, coalesces focus and visibility without polling', async () => {
    vi.useFakeTimers();
    let serverHistory=['first-device-feed'];
    let currentHistory=[...serverHistory];
    const read=vi.fn(async () => {currentHistory=[...serverHistory];});
    const resume=createForegroundRefresh(read);
    serverHistory.push('other-device-diaper');
    resume.request();resume.request();
    await vi.advanceTimersByTimeAsync(200);
    expect(read).toHaveBeenCalledTimes(1);
    expect(currentHistory).toContain('other-device-diaper');
    await vi.advanceTimersByTimeAsync(60000);
    expect(read).toHaveBeenCalledTimes(1); // no background requests
    serverHistory.push('other-device-pump');resume.request();
    await vi.advanceTimersByTimeAsync(200);
    expect(currentHistory).toContain('other-device-pump');
    resume.dispose();resume.request();await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('prewarms only same-origin build assets, never private API attachments or third-party requests', () => {
    expect(safeOfflineAssets([
      {name:'https://baby.test/_next/static/chunk.js'},
      {name:'https://baby.test/assets/main.css'},
      {name:'https://baby.test/_next/static/chunk.js'},
      {name:'https://baby.test/api/photos/file/private'},
      {name:'https://other.test/assets/tracker.js'},
    ],'https://baby.test')).toEqual(['/_next/static/chunk.js','/assets/main.css']);
  });
});
