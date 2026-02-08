"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDocument = exports.updateDocument = exports.getDocumentById = exports.getDocuments = exports.createDocument = void 0;
const prismaClient_1 = require("../config/prismaClient");
const createDocument = async (req, res, next) => {
    try {
        const { title, type } = req.body;
        const author = await prismaClient_1.prisma.user.findFirst({ where: { id: req.user.id } });
        if (!author) {
            throw new Error("Utilisateur introuvable");
        }
        const document = await prismaClient_1.prisma.document.create({
            data: {
                title: title,
                type: type,
                author: {
                    connect: { id: author.id },
                },
            },
        });
        res.status(201).json(document);
    }
    catch (error) {
        next(error);
    }
};
exports.createDocument = createDocument;
const getDocuments = async (req, res, next) => {
    try {
        const documents = await prismaClient_1.prisma.document.findMany();
        res.json(documents);
    }
    catch (error) {
        next(error);
    }
};
exports.getDocuments = getDocuments;
const getDocumentById = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const document = await prismaClient_1.prisma.document.findUnique({
            where: {
                id: id,
            },
        });
        if (!document) {
            res.status(404).json({ message: "Document not found" });
            return;
        }
        res.json(document);
    }
    catch (error) {
        next(error);
    }
};
exports.getDocumentById = getDocumentById;
const updateDocument = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { title, text, is_public } = req.body;
        const previous_document = await prismaClient_1.prisma.document.findFirst({
            where: { id: id },
        });
        if (!previous_document) {
            throw new Error("Le document n'existe pas");
        }
        const author = await prismaClient_1.prisma.user.findFirst({ where: { id: req.user.id } });
        if (!author) {
            throw new Error("Utilisateur introuvable");
        }
        await prismaClient_1.prisma.documentHistory.create({
            data: {
                title: previous_document.title,
                text: previous_document.text,
                public: previous_document.public,
                document: {
                    connect: {
                        id: id,
                    },
                },
                author: {
                    connect: {
                        id: author.id,
                    },
                },
            },
        });
        const document = await prismaClient_1.prisma.document.update({
            where: {
                id: id,
            },
            data: {
                title: title,
                text: text,
                author: {
                    connect: { id: author.id },
                },
                public: is_public,
                last_update: new Date(),
            },
        });
        res.json(document);
    }
    catch (error) {
        next(error);
    }
};
exports.updateDocument = updateDocument;
const deleteDocument = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        await prismaClient_1.prisma.documentHistory.deleteMany({
            where: {
                documentId: id,
            },
        });
        const deletedDocument = await prismaClient_1.prisma.document.delete({
            where: {
                id: id,
            },
        });
        res.json(deletedDocument);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteDocument = deleteDocument;
