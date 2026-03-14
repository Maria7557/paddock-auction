import { describe, expect, it } from "vitest";

describe("db singleton", () => {
  it("exports prisma client", async () => {
    const { prisma } = await import("../db");

    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe("function");
    expect(typeof prisma.$disconnect).toBe("function");
    expect(typeof prisma.$transaction).toBe("function");
  });

  it("returns same instance on multiple imports (singleton)", async () => {
    const { prisma: a } = await import("../db");
    const { prisma: b } = await import("../db");

    expect(a).toBe(b);
  });

  it("exports disconnectPrisma function", async () => {
    const { disconnectPrisma } = await import("../db");

    expect(typeof disconnectPrisma).toBe("function");
  });
});
