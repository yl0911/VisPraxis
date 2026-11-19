import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { getConnector } from "./connectors.js";
import { getSummary, images, sources } from "./data.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok", service: "vispraxis-api" }));
app.get("/api/dashboard", async () => ({ summary: getSummary(), sources, images }));
app.get("/api/sources", async () => sources);

app.post("/api/sources/:id/test", async (request, reply) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const source = sources.find((candidate) => candidate.id === params.id);
  if (!source) return reply.code(404).send({ message: "数据源不存在" });
  return getConnector(source.type).test(source);
});

app.patch("/api/images/:id/review", async (request, reply) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ status: z.enum(["verified", "incorrect", "captured"]) }).parse(request.body);
  const image = images.find((candidate) => candidate.id === params.id);
  if (!image) return reply.code(404).send({ message: "图像不存在" });
  image.reviewStatus = body.status;
  return image;
});

app.listen({ port: 4100, host: "127.0.0.1" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
