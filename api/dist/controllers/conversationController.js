"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteConversationsByDocumentId = exports.getConversationsByDocumentId = exports.getConversations = exports.createConversation = void 0;
const prismaClient_1 = require("../config/prismaClient");
const createConversation = async (req, res, next) => {
    try {
        const { message, response, model_id, document_id } = req.body;
        const author = await prismaClient_1.prisma.user.findFirst({ where: { id: req.user.id } });
        if (!author) {
            throw new Error("Utilisateur introuvable");
        }
        const conversation = await prismaClient_1.prisma.conversation.create({
            data: {
                message: message,
                response: response,
                model_id: model_id,
                author: {
                    connect: { id: author.id },
                },
                document: {
                    connect: { id: document_id },
                },
            },
        });
        res.status(201).json(conversation);
    }
    catch (error) {
        next(error);
    }
};
exports.createConversation = createConversation;
const getConversations = async (req, res, next) => {
    try {
        const conversations = await prismaClient_1.prisma.conversation.findMany();
        res.json(conversations);
    }
    catch (error) {
        next(error);
    }
};
exports.getConversations = getConversations;
const getConversationsByDocumentId = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const conversations = await prismaClient_1.prisma.conversation.findMany({
            where: {
                documentId: id,
            },
        });
        if (!conversations) {
            res.status(404).json({ message: "Conversations not found" });
            return;
        }
        res.json(conversations);
    }
    catch (error) {
        next(error);
    }
};
exports.getConversationsByDocumentId = getConversationsByDocumentId;
const deleteConversationsByDocumentId = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const deletedConversations = await prismaClient_1.prisma.conversation.deleteMany({
            where: {
                documentId: id,
            },
        });
        res.json(deletedConversations);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteConversationsByDocumentId = deleteConversationsByDocumentId;
