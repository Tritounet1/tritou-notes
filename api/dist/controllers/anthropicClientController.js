"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModels = exports.sendMessage = void 0;
const anthropicClient_1 = require("../config/anthropicClient");
const prismaClient_1 = require("../config/prismaClient");
const sendMessage = async (req, res, next) => {
    try {
        const { model_id, message, document_id } = req.body;
        const response = await (0, anthropicClient_1.getResponse)(model_id, message);
        if (response) {
            const answer = response.find((b) => b.type === "text")?.text ?? "Pas de réponse";
            await prismaClient_1.prisma.conversation.create({
                data: {
                    message: message,
                    response: answer,
                    model_id: model_id,
                    documentId: document_id,
                    authorId: req.user.id,
                },
            });
        }
        res.status(201).json(response);
    }
    catch (error) {
        next(error);
    }
};
exports.sendMessage = sendMessage;
const getModels = async (req, res, next) => {
    try {
        const models = await (0, anthropicClient_1.getAnthropicModels)();
        res.json(models);
    }
    catch (error) {
        next(error);
    }
};
exports.getModels = getModels;
