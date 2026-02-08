"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserPermissions = exports.getUserPermissionsByUserId = void 0;
const prismaClient_1 = require("../config/prismaClient");
const getUserPermissionsByUserId = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (req.user.role !== "ADMIN") {
            res.json({
                message: "You don't have access to this route.",
            });
            return;
        }
        const userPermissions = await prismaClient_1.prisma.userPermissions.findFirst({
            where: {
                userId: id,
            },
        });
        res.json(userPermissions);
    }
    catch (error) {
        next(error);
    }
};
exports.getUserPermissionsByUserId = getUserPermissionsByUserId;
const updateUserPermissions = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { modifyScraper, useScraper, modifyScraperStatus, deleteScraper, createDocument, deleteDocument, modifyDocument, useAiChatBot, accessScrapersPage, accessInstancesScrapersPage, } = req.body;
        const user = await prismaClient_1.prisma.user.findFirst({
            where: {
                id: req.user.id,
            },
        });
        if (user?.role !== "ADMIN") {
            res.json({
                message: "You don't have access to this route.",
            });
            return;
        }
        const userPermissions = await prismaClient_1.prisma.userPermissions.update({
            where: {
                userId: id,
            },
            data: {
                modifyScraper: modifyScraper,
                useScraper: useScraper,
                modifyScraperStatus: modifyScraperStatus,
                deleteScraper: deleteScraper,
                createDocument: createDocument,
                deleteDocument: deleteDocument,
                modifyDocument: modifyDocument,
                useAiChatBot: useAiChatBot,
                accessScrapersPage: accessScrapersPage,
                accessInstancesScrapersPage: accessInstancesScrapersPage,
            },
        });
        res.json(userPermissions);
    }
    catch (error) {
        next(error);
    }
};
exports.updateUserPermissions = updateUserPermissions;
