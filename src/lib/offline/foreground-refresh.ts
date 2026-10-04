/** Coalesce app resume events without remounting forms or running a background poll. */
export function createForegroundRefresh(refresh: () => Promise<void>, options: {delayMs?:number; cooldownMs?:number; now?:()=>number} = {}) {
  const delay = options.delayMs ?? 180;
  const cooldown = options.cooldownMs ?? 1000;
  const now = options.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout>|null=null;
  let running=false;
  let last=-Infinity;
  let disposed=false;
  return {
    request() {
      if (disposed || running || now()-last < cooldown) return;
      if (timer) clearTimeout(timer);
      timer=setTimeout(async () => {
        timer=null;
        if (disposed || running) return;
        running=true; last=now();
        try { await refresh(); } finally { running=false; }
      },delay);
    },
    dispose() {disposed=true;if(timer)clearTimeout(timer);},
  };
}

export function safeOfflineAssets(entries: {name:string}[], origin: string): string[] {
  return [...new Set(entries.flatMap(entry => {
    try {
      const url=new URL(entry.name,origin);
      if (url.origin !== origin || !/^\/(?:_next\/static\/|assets\/|sprout[^/]*\.png$)/.test(url.pathname)) return [];
      return [url.pathname+url.search];
    } catch { return []; }
  }))];
}
