import { mkdirSync, readFileSync, cpSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
export function archiveStatic(
  source: string,
  directory: string,
  revision: string,
) {
  const manifest = readFileSync(resolve(source, "deployment.json"));
  const parsed: unknown = JSON.parse(manifest.toString());
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("revision" in parsed) ||
    parsed.revision !== revision ||
    !("publicConfig" in parsed)
  )
    throw new Error("Invalid static artifact manifest");
  const configHash = createHash("sha256").update(manifest).digest("hex");
  const artifact = resolve(directory, `${revision}-${configHash}`);
  if (!existsSync(artifact)) {
    mkdirSync(directory, { recursive: true });
    cpSync(source, artifact, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  return artifact;
}
