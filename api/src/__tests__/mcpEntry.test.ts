import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), stdioIdentity: vi.fn(), buildServer: vi.fn(), transport: vi.fn() }));
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../mcp/server", () => ({ buildServer: mocks.buildServer, stdioIdentity: mocks.stdioIdentity }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: mocks.transport }));

const start = async () => {
  vi.resetModules();
  await import("../mcp");
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildServer.mockReturnValue({ connect: mocks.connect });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("MCP entry point", () => {
  it("serves stdio as the token's user", async () => {
    mocks.stdioIdentity.mockResolvedValue({ userId: 7, readOnly: false });
    await start();
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalled());
    expect(mocks.buildServer).toHaveBeenCalledWith({ userId: 7, readOnly: false });
  });

  it("exits when no token exists for stdio", async () => {
    mocks.stdioIdentity.mockResolvedValue(null);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await start();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("Set MCP_TOKEN"));
  });

  it("reports non-Error failures too", async () => {
    mocks.stdioIdentity.mockRejectedValue("boom");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await start();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(process.stderr.write).toHaveBeenCalledWith("Fatal: boom\n");
  });
});
