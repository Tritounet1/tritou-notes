import crypto from "crypto";

/** 256 random bits, prefixed so a leaked token is recognisable. */
export const generateMcpToken = () => `tritou_mcp_${crypto.randomBytes(32).toString("base64url")}`;

/** Stored form of the token, recomputed by the MCP server to check requests. */
export const hashMcpToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
