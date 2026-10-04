/** Decode display/local-scope claims only. The server remains responsible for JWT verification. */
export function decodeJwtPayloadPart(payload: string): Record<string, any> {
  const normalized = payload.replace(/-/g,'+').replace(/_/g,'/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4,'=');
  const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  const claims = JSON.parse(new TextDecoder().decode(bytes));
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new Error('Invalid session claims');
  return claims;
}
