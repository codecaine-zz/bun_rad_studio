// Preloaded into the File Manager server the tutorial starts (bun --preload). It makes two changes to the running program,
// in memory only (no file is edited), so the recording is safe:
//  1. the operating system's keychain is swapped for a throwaway in-memory one, so nothing (not even a probe entry) is
//     written to the real macOS Keychain;
//  2. the Databases tab does not read the .env file in the program's install folder (the repository's own, which belongs to
//     the person recording); it still reads the start folder, which holds a throwaway .env for the video.
import { plugin } from "bun";

const patch = (src: string, from: string, to: string) => {
  if (!src.includes(from)) throw new Error(`tutorial preload: the code changed, update the patch for: ${from.slice(0, 60)}`);
  return src.replace(from, to);
};

plugin({
  name: "tutorial-safe-databases",
  setup(build) {
    build.onLoad({ filter: /src[\\/]db[\\/]profiles\.ts$/ }, async (args) => {
      const stand = `
class TutorialKeychain implements SecretStore {
  readonly kind = "os-keychain" as const;
  private readonly map = new Map<string, string>();
  async get(id: string) { return this.map.get(id) ?? null; }
  async set(id: string, password: string) { this.map.set(id, password); }
  async delete(id: string) { this.map.delete(id); }
}
`;
      const marker = "export async function detectSecretStore(service = SERVICE): Promise<SecretStore> {";
      return { contents: patch(await Bun.file(args.path).text(), marker, `${stand}\n${marker}\n  return new TutorialKeychain();`), loader: "ts" };
    });
    build.onLoad({ filter: /fmDbHooks\.ts$/ }, async (args) => ({
      contents: patch(await Bun.file(args.path).text(), "appRoots: () => [installRoot(realLayout())],", "appRoots: () => [],"),
      loader: "ts",
    }));
  },
});
