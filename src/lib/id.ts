export function createId(prefix?: string): string {
  const uuid = createUuid();
  return prefix ? `${prefix}${uuid}` : uuid;
}

export function createUuid(): string {
  // Prefer native UUID when available.
  const anyCrypto = (globalThis as any).crypto as Crypto | undefined;
  if (anyCrypto && typeof (anyCrypto as any).randomUUID === 'function') {
    return (anyCrypto as any).randomUUID();
  }

  // RFC4122 v4 using getRandomValues when possible.
  if (anyCrypto && typeof anyCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    anyCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
      .slice(8, 10)
      .join('')}-${hex.slice(10, 16).join('')}`;
  }

  // Last resort: timestamp + random.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}
