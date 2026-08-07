import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { HttpError, notFound } from "./errors.js";

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function mimeType(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Vite emits content-hashed asset names, so those may be cached forever. */
function cacheControl(path: string): string {
  return path.includes(`${sep}assets${sep}`)
    ? "public, max-age=31536000, immutable"
    : "no-store";
}

export interface StaticHandler {
  /** Serves a file, or the SPA shell when nothing matches. */
  serve(response: ServerResponse, pathname: string): Promise<void>;
  /** Serves the SPA shell directly, for a deep link that matched no file. */
  serveShell(response: ServerResponse): Promise<void>;
}

/**
 * Reads the built client's shell once and adapts it to the mount point.
 *
 * Vite emits absolute `/assets/...` URLs, so a viewer mounted under a path on a
 * reverse proxy needs them rewritten. Doing it at serve time rather than build
 * time means one build works wherever it is deployed.
 */
async function loadShell(clientDir: string, basePath: string): Promise<Buffer> {
  const html = await readFile(join(clientDir, "index.html"), "utf8");
  if (basePath === "/") return Buffer.from(html, "utf8");

  const rewritten = html
    .replaceAll('"/assets/', `"${basePath}assets/`)
    .replace(
      /<\/head>/i,
      `<script>window.__ORION_BASE__=${JSON.stringify(basePath)}</script></head>`,
    );
  return Buffer.from(rewritten, "utf8");
}

/**
 * Builds the handler for everything the Vite build produced.
 *
 * A client directory that is not there is not a startup failure: the API is
 * independently useful, and the tests exercise the whole server without anyone
 * having run a browser build. It reports 503 with the command to fix it.
 */
export async function createStaticHandler(
  clientDir: string,
  basePath: string,
): Promise<StaticHandler> {
  const root = resolve(clientDir);
  let shell: Buffer | undefined;
  try {
    shell = await loadShell(root, basePath);
  } catch {
    shell = undefined;
  }

  const unbuilt = (): HttpError =>
    new HttpError(
      503,
      "client_not_built",
      "The viewer client has not been built. Run 'pnpm --filter @orion/viewer build:client'.",
    );

  async function serveShell(response: ServerResponse): Promise<void> {
    if (shell === undefined) throw unbuilt();
    response.writeHead(200, {
      "content-type": MIME_TYPES[".html"] as string,
      "content-length": shell.byteLength,
      "cache-control": "no-store",
    });
    response.end(shell);
  }

  return {
    serveShell,

    async serve(response, pathname) {
      if (shell === undefined) throw unbuilt();
      if (pathname === "" || pathname === "/") return serveShell(response);

      let decoded: string;
      try {
        decoded = decodeURIComponent(pathname);
      } catch {
        throw notFound("not_found", "Not found.");
      }
      if (decoded.includes("\0")) throw notFound("not_found", "Not found.");

      const file = resolve(root, `.${decoded.startsWith("/") ? decoded : `/${decoded}`}`);

      // 404 rather than 403 for an escape attempt: refusing differently from a
      // miss would confirm what exists outside the client directory.
      const rel = relative(root, file);
      if (rel === "" || rel.startsWith("..")) throw notFound("not_found", "Not found.");

      let size: number;
      try {
        const stats = await stat(file);
        if (!stats.isFile()) return serveShell(response);
        size = stats.size;
      } catch {
        // A deep link like /r/local/a.json matches no file; the SPA resolves it
        // client-side, which is what makes a hard refresh work.
        return serveShell(response);
      }

      response.writeHead(200, {
        "content-type": mimeType(file),
        "content-length": size,
        "cache-control": cacheControl(file),
      });
      createReadStream(file).pipe(response);
    },
  };
}
