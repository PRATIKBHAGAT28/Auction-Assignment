require("dotenv").config();

const app = require("./app");
const prisma = require("./db");

const port = Number(process.env.PORT) || 3000;

async function start() {
  await prisma.$connect();

  const server = app.listen(port);

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  console.log(`Auction API running on port ${port}`);

  async function shutdown() {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(async (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the other process or run with PORT=<available-port>.`
    );
  } else {
    console.error("Failed to start server:", error);
  }
  await prisma.$disconnect();
  process.exit(1);
});