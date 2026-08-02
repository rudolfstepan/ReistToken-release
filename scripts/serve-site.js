import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";

const root = resolve("dist");
const port = Number(process.env.REIST_SITE_PORT || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".sol": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function responseHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; " +
      "connect-src 'self'; object-src 'none'; base-uri 'none'; " +
      "frame-ancestors 'none'; form-action 'none'",
  };
}

const server = createServer((request, response) => {
  if (!new Set(["GET", "HEAD"]).has(request.method || "")) {
    response.writeHead(405, {
      ...responseHeaders("text/plain; charset=utf-8"),
      Allow: "GET, HEAD",
    });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response
      .writeHead(400, responseHeaders("text/plain; charset=utf-8"))
      .end("Bad request");
    return;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(root, normalize(relativePath));

  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    response
      .writeHead(403, responseHeaders("text/plain; charset=utf-8"))
      .end("Forbidden");
    return;
  }

  let file = candidate;
  if (existsSync(file) && statSync(file).isDirectory()) {
    file = resolve(file, "index.html");
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    const errorPage = resolve(root, "404.html");
    if (existsSync(errorPage) && statSync(errorPage).isFile()) {
      response.writeHead(404, responseHeaders("text/html; charset=utf-8"));
      createReadStream(errorPage).pipe(response);
    } else {
      response
        .writeHead(404, responseHeaders("text/plain; charset=utf-8"))
        .end("Not found");
    }
    return;
  }

  response.writeHead(
    200,
    responseHeaders(contentTypes[extname(file)] || "application/octet-stream")
  );
  createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`REIST-Projektseite: http://127.0.0.1:${port}`);
});
