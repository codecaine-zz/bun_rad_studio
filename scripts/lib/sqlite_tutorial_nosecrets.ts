// Preloaded into the File Manager server the tutorial records (bun --preload): Bun.secrets, which talks to the real system
// keychain, is replaced by a private in-memory store, so the app behaves as on a computer with a working keychain while
// nothing is ever written to (or read from) the real one. The memory is gone when the server stops.
const vault = new Map<string, string>();
const key = (o: { service: string; name: string }) => `${o.service}\u0000${o.name}`;
(Bun as any).secrets = {
  get: async (o: any) => vault.get(key(o)) ?? null,
  set: async (o: any) => { vault.set(key(o), o.value); },
  delete: async (o: any) => vault.delete(key(o)),
};
