import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { prisma } from "./db";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { bidsRoutes } from "./routes/bids";
import { sellerRoutes } from "./routes/seller";

let activeServer: FastifyInstance | null = null;
let isShuttingDown = false;
let signalHandlersRegistered = false;
let unhandledRejectionHandlerRegistered = false;

async function getPort(): Promise<number> {
  const rawPort = process.env.PORT?.trim();

  if (!rawPort) {
    return 4000;
  }

  const parsedPort = Number.parseInt(rawPort, 10);

  if (Number.isNaN(parsedPort)) {
    return 4000;
  }

  return parsedPort;
}

async function getCorsOrigin(): Promise<string> {
  return process.env.FRONTEND_URL?.trim() || "*";
}

async function logProcessError(message: string, error: unknown, signal: string): Promise<void> {
  if (activeServer) {
    activeServer.log.error({ err: error, signal }, message);
    return;
  }

  console.error(message, { signal, error });
}

async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  try {
    if (activeServer) {
      activeServer.log.info({ signal }, "Shutting down server");
      await activeServer.close();
    }

    await disconnectDatabase();
    process.exit(exitCode);
  } catch (error) {
    await logProcessError("Graceful shutdown failed", error, signal);

    try {
      await disconnectDatabase();
    } catch (disconnectError) {
      await logProcessError("Prisma disconnect failed", disconnectError, signal);
    }

    process.exit(1);
  }
}

async function handleUnhandledRejection(reason: unknown): Promise<void> {
  if (activeServer) {
    activeServer.log.error({ err: reason }, "Unhandled rejection");
  } else {
    console.error("Unhandled rejection", reason);
  }

  await shutdown("unhandledRejection", 1);
}

async function registerSignalHandlers(): Promise<void> {
  if (signalHandlersRegistered) {
    return;
  }

  process.once("SIGINT", async function onSigint(): Promise<void> {
    await shutdown("SIGINT");
  });

  process.once("SIGTERM", async function onSigterm(): Promise<void> {
    await shutdown("SIGTERM");
  });

  signalHandlersRegistered = true;
}

async function registerUnhandledRejectionHandler(): Promise<void> {
  if (unhandledRejectionHandlerRegistered) {
    return;
  }

  process.on("unhandledRejection", async function onUnhandledRejection(reason: unknown): Promise<void> {
    await handleUnhandledRejection(reason);
  });

  unhandledRejectionHandlerRegistered = true;
}

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
  });
  const corsOrigin = await getCorsOrigin();

  await server.register(cors, {
    origin: corsOrigin,
  });

  await server.register(cookie);

  await server.register(
    async function registerApiRoutes(api): Promise<void> {
      api.get("/health", async function healthCheckHandler(): Promise<{
        status: string;
        timestamp: string;
      }> {
        return {
          status: "ok",
          timestamp: new Date().toISOString(),
        };
      });

      await api.register(authRoutes, {
        prefix: "/auth",
      });

      await api.register(bidsRoutes);
      await api.register(sellerRoutes);
      await api.register(adminRoutes);
    },
    {
      prefix: "/api",
    },
  );

  return server;
}

export async function start(): Promise<void> {
  const server = await buildServer();
  const port = await getPort();

  activeServer = server;

  await registerSignalHandlers();
  await registerUnhandledRejectionHandler();
  await server.listen({
    port,
    host: "0.0.0.0",
  });

  server.log.info({ port }, "Server started");
}

async function main(): Promise<void> {
  try {
    await start();
  } catch (error) {
    await logProcessError("Failed to start server", error, "startup");
    await disconnectDatabase();
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
