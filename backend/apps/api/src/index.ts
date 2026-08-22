import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

const config = loadEnv();
const app = await buildApp(config);

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
