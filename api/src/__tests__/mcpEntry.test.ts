import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listen: vi.fn(), connect: vi.fn(), stdioUser: vi.fn(), buildServer: vi.fn(), transport: vi.fn() }));
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../mcp/http", () => ({ createMcpApp: () => ({ listen: mocks.listen }) }));
vi.mock("../mcp/server", () => ({ buildServer: mocks.buildServer, stdioUser: mocks.stdioUser }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: mocks.transport }));

const start = async () => {
  vi.resetModules();
  await import("../mcp");
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildServer.mockReturnValue({ connect: mocks.connect });
  mocks.listen.mockImplementation((_port: number, ready: () => void) => ready());
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("MCP entry point", () => {
  it("serves HTTP when MCP_HTTP_PORT is set", async () => {
    vi.stubEnv("MCP_HTTP_PORT", "3001");
    await start();
    await vi.waitFor(() => expect(mocks.listen).toHaveBeenCalledWith(3001, expect.any(Function)));
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("serves stdio as the token's user otherwise", async () => {
    vi.stubEnv("MCP_HTTP_PORT", "");
    mocks.stdioUser.mockResolvedValue(7);
    await start();
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalled());
    expect(mocks.buildServer).toHaveBeenCalledWith(7);
  });

  it("exits when no token exists for stdio", async () => {
    vi.stubEnv("MCP_HTTP_PORT", "");
    mocks.stdioUser.mockResolvedValue(null);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await start();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("No MCP token"));
  });

  it("reports non-Error failures too", async () => {
    vi.stubEnv("MCP_HTTP_PORT", "");
    mocks.stdioUser.mockRejectedValue("boom");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await start();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(process.stderr.write).toHaveBeenCalledWith("Fatal: boom\n");
  });
});
