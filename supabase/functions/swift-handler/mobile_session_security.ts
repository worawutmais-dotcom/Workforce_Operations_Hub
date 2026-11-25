const mobileSessionDurationDays = 30;

/// Returns the server-storable digest for a mobile bearer token.
/// The raw token is returned only once to the authenticated client.
export async function mobileTokenDigest(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

/// New sessions have a finite lifetime so a copied device token cannot remain
/// valid indefinitely. Renewal is intentionally an explicit future workflow.
export function mobileSessionExpiresAt(issuedAt = new Date()): string {
  return new Date(
    issuedAt.getTime() + mobileSessionDurationDays * 24 * 60 * 60 * 1000,
  ).toISOString();
}
