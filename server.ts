import { parse } from "node:url";
import express from "express";
import next from "next";
import swaggerUi from "swagger-ui-express";
import { getSwaggerSpec } from "./src/lib/swagger-spec";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST ?? "localhost";

const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

void nextApp.prepare().then(() => {
  const app = express();
  const spec = getSwaggerSpec();

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec));
  app.get("/openapi.json", (_req, res) => {
    res.json(spec);
  });

  app.use((req, res) => {
    const parsedUrl = parse(req.url ?? "", true);
    void handle(req, res, parsedUrl);
  });

  app.listen(port, () => {
    console.log(`Ready on http://${host}:${port}`);
    console.log(`Swagger UI: http://${host}:${port}/api-docs`);
  });
});
