import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";

const root = process.cwd();

export function getSwaggerSpec() {
  return swaggerJsdoc({
    definition: {
      openapi: "3.0.3",
      info: {
        title: "Collecter API",
        version: "0.1.0",
      },
      servers: [{ url: "/", description: "Current host" }],
    },
    apis: [
      path.join(root, "src/app/api/**/*.ts"),
      path.join(root, "src/swagger/**/*.ts"),
    ],
  });
}
