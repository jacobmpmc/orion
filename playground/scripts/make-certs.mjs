/**
 * Generates a throwaway self-signed certificate into playground/tls/, for
 * trying `orion-viewer --tls-cert/--tls-key`.
 *
 * Shells out to openssl because Node has no built-in way to issue a
 * certificate. The output is gitignored -- never commit key material, even
 * worthless key material.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../tls/", import.meta.url));
mkdirSync(dir, { recursive: true });

try {
  execFileSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", `${dir}key.pem`,
      "-out", `${dir}cert.pem`,
      "-days", "30",
      "-subj", "/CN=localhost",
    ],
    { stdio: "inherit" },
  );
} catch (error) {
  process.stderr.write(
    `\nCould not run openssl. Install it, or point --tls-cert/--tls-key at a certificate you already have.\n  ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
  process.exit();
}

process.stdout.write(`\nWrote ${dir}cert.pem and key.pem. Run: pnpm serve:https\n`);
