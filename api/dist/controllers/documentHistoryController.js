"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentHistoriesByDocumentId = exports.getDocumentsHistories = void 0;
const prismaClient_1 = require("../config/prismaClient");
const getDocumentsHistories = async (req, res, next) => {
    try {
        const documentHistories = await prismaClient_1.prisma.documentHistory.findMany();
        res.json(documentHistories);
    }
    catch (error) {
        next(error);
    }
};
exports.getDocumentsHistories = getDocumentsHistories;
const getDocumentHistoriesByDocumentId = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const documentHistories = await prismaClient_1.prisma.documentHistory.findMany({
            where: {
                documentId: id,
            },
        });
        if (!documentHistories) {
            res.status(404).json({ message: "DocumentHistories not found" });
            return;
        }
        res.json(documentHistories);
    }
    catch (error) {
        next(error);
    }
};
exports.getDocumentHistoriesByDocumentId = getDocumentHistoriesByDocumentId;
