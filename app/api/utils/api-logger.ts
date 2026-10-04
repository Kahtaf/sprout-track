import { NextRequest } from 'next/server';
export interface ApiLogEntry {
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  ip?: string;
  userAgent?: string;
  caretakerId?: string;
  familyId?: string;
  error?: string;
  requestBody?: any;
  responseBody?: any;
}

export async function logApiCall(entry: ApiLogEntry): Promise<void> {
  // Check if logging is enabled
  if (process.env.ENABLE_LOG !== 'true') {
    return;
  }

  // Cloudflare observability handles metadata; never persist infant history,
  // credentials, identifiers, request bodies or response bodies in API logs.
  console.log(JSON.stringify({
    event: 'api_request',
    method: entry.method,
    path: entry.path.split('?')[0],
    status: entry.status,
    durationMs: entry.durationMs,
  }));
}

export function getClientInfo(req: NextRequest) {
  return {
    ip: req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}
