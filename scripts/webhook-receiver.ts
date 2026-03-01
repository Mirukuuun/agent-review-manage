import Fastify from "fastify";

async function main(): Promise<void> {
  const app = Fastify({ logger: false });

  app.post("/review-callback", async (request) => {
    process.stdout.write(
      JSON.stringify(
        {
          received_at: new Date().toISOString(),
          headers: {
            "x-event-id": request.headers["x-event-id"],
            "x-event-timestamp": request.headers["x-event-timestamp"],
            "x-signature": request.headers["x-signature"]
          },
          body: request.body
        },
        null,
        2
      ) + "\n"
    );

    return { ok: true };
  });

  const port = Number(process.env.WEBHOOK_RECEIVER_PORT || "9000");
  await app.listen({ host: "127.0.0.1", port });
  process.stdout.write(`webhook receiver listening on http://127.0.0.1:${port}/review-callback\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
