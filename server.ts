import { parse } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";
import next from "next";
import swaggerUi from "swagger-ui-express";
import { getSwaggerSpec } from "./src/lib/swagger-spec";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST ?? "localhost";

const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

// 조회 요청까지 남기면 로그가 묻히므로 상태를 바꾸는 메서드만 기록한다.
const LOGGED_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

void nextApp.prepare().then(() => {
  const app = express();
  const spec = getSwaggerSpec();

  // 변경 요청만 stdout에 기록한다. 같은 리소스에 요청이 겹쳐 들어왔는지를
  // 사후에 판별하려면 도착 시각(recv)과 완료 시각이 모두 필요하므로 한 줄에 같이 남긴다.
  // Railway의 HTTP Logs는 요금제/보존기간을 타지만 stdout은 배포 로그로 남는다.
  app.use((req, res, nextMiddleware) => {
    if (!LOGGED_METHODS.has(req.method)) {
      nextMiddleware();
      return;
    }

    const recv = new Date();
    const id = randomUUID().slice(0, 8);

    res.on("finish", () => {
      console.log(
        JSON.stringify({
          tag: "req",
          id,
          recv: recv.toISOString(),
          ms: Date.now() - recv.getTime(),
          method: req.method,
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          ip: req.headers["x-forwarded-for"] ?? req.socket.remoteAddress,
          len: req.headers["content-length"],
          ua: req.headers["user-agent"],
        })
      );
    });

    nextMiddleware();
  });

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
