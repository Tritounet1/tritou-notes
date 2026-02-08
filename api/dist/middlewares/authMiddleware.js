"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authHandler = void 0;
const prismaClient_1 = require("../config/prismaClient");
const jwtUtils_1 = require("../utils/jwtUtils");
const authHandler = async (req, res, next) => {
    try {
        // Recuperer le token depuis le cookie ou le header Authorization
        let token;
        if (req.cookies?.auth_token) {
            token = req.cookies.auth_token;
        }
        else if (req.headers.authorization) {
            token = req.headers.authorization.replace("Bearer ", "");
        }
        if (token) {
            const verifytoken = (0, jwtUtils_1.decodeToken)(token);
            const user = await prismaClient_1.prisma.user.findUnique({
                where: {
                    id: parseInt(verifytoken.id),
                },
            });
            if (!user) {
                throw "User not found";
            }
            req.user = {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
            };
            return next();
        }
        // Permettre l'acces aux documents publics sans auth
        if (req.path.startsWith("/api/documents/")) {
            const documentId = req.path.split("/")[3];
            if (documentId) {
                const document = await prismaClient_1.prisma.document.findFirst({
                    where: { id: parseInt(documentId) },
                });
                if (document?.public) {
                    return next();
                }
            }
        }
        throw "Authentication is required";
    }
    catch (error) {
        return res.status(401).json({ message: "Authorization required" });
    }
};
exports.authHandler = authHandler;
