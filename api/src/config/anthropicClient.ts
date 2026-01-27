import Anthropic from "@anthropic-ai/sdk";
import config from "./config";

const client = new Anthropic({
  apiKey: config.anthropicKey,
});

export const getAnthropicModels = async () => {
  const models: Anthropic.Models.ModelInfo[] = [];
  for await (const modelInfo of client.models.list()) {
    models.push(modelInfo);
  }
  return models;
};

export const getResponse = async (model_id: string, content: string) => {
  const message = await client.messages.create({
    max_tokens: 1024,
    messages: [{ role: "user", content: content }],
    model: model_id,
  });

  console.log(message.content);

  return message.content;
};
