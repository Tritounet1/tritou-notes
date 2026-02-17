import Anthropic from "@anthropic-ai/sdk";
import { decrypt } from "../utils/utils";
import { prisma } from "./prismaClient";

const getAnthropicKey = async () => {
  const settings = await prisma.settings.findFirst({
    where: {
      id: 1,
    },
  });
  if (!settings) {
    return "";
  }
  return settings?.anthropicApiKey;
};

export const getAnthropicModels = async () => {
  const anthropicKey = await getAnthropicKey();
  const decryptedKey = decrypt(anthropicKey || "") || "";
  const models: Anthropic.Models.ModelInfo[] = [];
  const client = new Anthropic({
    apiKey: decryptedKey,
  });
  for await (const modelInfo of client.models.list()) {
    models.push(modelInfo);
  }
  return models;
};

export const getResponse = async (model_id: string, content: string) => {
  const anthropicKey = await getAnthropicKey();
  const decryptedKey = decrypt(anthropicKey || "") || "";
  const client = new Anthropic({
    apiKey: decryptedKey,
  });
  const response = await client.messages.create({
    max_tokens: 1024,
    messages: [{ role: "user", content: content }],
    model: model_id,
  });
  return response.content;
};
