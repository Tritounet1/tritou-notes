"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResponse = exports.getAnthropicModels = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const config_1 = __importDefault(require("./config"));
const client = new sdk_1.default({
    apiKey: config_1.default.anthropicKey,
});
const getAnthropicModels = async () => {
    const models = [];
    for await (const modelInfo of client.models.list()) {
        models.push(modelInfo);
    }
    return models;
};
exports.getAnthropicModels = getAnthropicModels;
const getResponse = async (model_id, content) => {
    const response = await client.messages.create({
        max_tokens: 1024,
        messages: [{ role: "user", content: content }],
        model: model_id,
    });
    return response.content;
};
exports.getResponse = getResponse;
