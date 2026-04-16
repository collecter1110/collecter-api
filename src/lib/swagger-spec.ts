import path from "node:path";
import fs from "node:fs";
import swaggerJsdoc from "swagger-jsdoc";

const root = process.cwd();
const apiDir = path.join(root, "src/app");
const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;
type HttpMethod = (typeof httpMethods)[number];

function getRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...getRouteFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      result.push(fullPath);
    }
  }

  return result;
}

function toOpenApiPath(routeFilePath: string): string {
  const relative = path.relative(apiDir, routeFilePath);
  const folderPath = relative.replace(/\/route\.ts$/, "");
  const segments = folderPath
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => {
      const paramMatch = segment.match(/^\[(.+)\]$/);
      return paramMatch ? `{${paramMatch[1]}}` : segment;
    });

  if (segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

function toTagName(openApiPath: string): string {
  const firstSegment = openApiPath.split("/").filter(Boolean)[0] ?? "General";
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

function getMethods(source: string): HttpMethod[] {
  const methods: HttpMethod[] = [];
  for (const method of httpMethods) {
    const pattern = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`);
    if (pattern.test(source)) methods.push(method);
  }
  return methods;
}

function buildAutoPaths() {
  const paths: Record<string, Record<string, unknown>> = {};
  const routeFiles = getRouteFiles(apiDir);

  for (const routeFilePath of routeFiles) {
    const source = fs.readFileSync(routeFilePath, "utf8");
    const openApiPath = toOpenApiPath(routeFilePath);
    const methods = getMethods(source);
    const tagName = toTagName(openApiPath);

    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    for (const method of methods) {
      const methodLower = method.toLowerCase();
      if (paths[openApiPath][methodLower]) continue;

      paths[openApiPath][methodLower] = {
        tags: [tagName],
        summary: `${method} ${openApiPath}`,
        responses: {
          200: {
            description: "Success",
          },
        },
      };
    }
  }

  return paths;
}

export function getSwaggerSpec() {
  const autoPaths = buildAutoPaths();
  const jsdocSpec = swaggerJsdoc({
    definition: {
      openapi: "3.0.3",
      info: {
        title: "Collecter API",
        version: "0.1.0",
      },
      servers: [{ url: "/", description: "Current host" }],
    },
    apis: [
      path.join(root, "src/app/**/*.ts"),
      path.join(root, "src/swagger/**/*.ts"),
    ],
  });

  const jsdocSpec2 = jsdocSpec as { paths?: Record<string, Record<string, unknown>> };
  const jsdocPaths = jsdocSpec2.paths ?? {};

  for (const [openApiPath, operations] of Object.entries(jsdocPaths)) {
    autoPaths[openApiPath] = {
      ...(autoPaths[openApiPath] ?? {}),
      ...operations,
    };
  }

  return {
    ...jsdocSpec,
    paths: autoPaths,
  };
}
