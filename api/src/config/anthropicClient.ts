import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

export const getAnthropicModels = async () => {
  const models: Anthropic.Models.ModelInfo[] = [];
  for await (const modelInfo of client.models.list()) {
    console.log(modelInfo.id);
  }

  return models;
};

export const getResponse = async (content: string) => {
  const message = await client.messages.create({
    max_tokens: 1024,
    messages: [{ role: "user", content: content }],
    model: "claude-sonnet-4-5-20250929",
  });

  console.log(message.content);

  return message.content;
};
