import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.API_PORT ?? 4000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Recidivist API listening on http://localhost:${info.port}`);
});
