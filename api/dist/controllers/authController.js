"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.me = exports.logout = exports.register = exports.login = void 0;
const prismaClient_1 = require("../config/prismaClient");
const bcryptUtils_1 = require("../utils/bcryptUtils");
const cookieUtils_1 = require("../utils/cookieUtils");
const jwtUtils_1 = require("../utils/jwtUtils");
const login = async (req, res, next) => {
    try {
        const { email, username, password } = req.body;
        let user;
        if (email === "") {
            user = await prismaClient_1.prisma.user.findFirst({
                where: { username: username },
            });
        }
        else {
            user = await prismaClient_1.prisma.user.findFirst({
                where: { email: email },
            });
        }
        if (user === undefined || user === null) {
            res.status(401).json({
                error: "Invalid credentials",
            });
            return;
        }
        const isPasswordCorrect = await (0, bcryptUtils_1.verifyPassword)(password, user.password);
        if (!isPasswordCorrect) {
            res.status(401).json({
                error: "Invalid credentials",
            });
            return;
        }
        const userPermissions = await prismaClient_1.prisma.userPermissions.findFirst({
            where: {
                userId: user.id,
            },
        });
        const jwtToken = (0, jwtUtils_1.createToken)(user.id.toString(), user.username, user.email, user.role);
        if (!jwtToken) {
            throw new Error("Erreur lors de la creation du token");
        }
        (0, cookieUtils_1.setAuthCookie)(res, jwtToken);
        res.status(200).json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                userPermissions: userPermissions,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.login = login;
const register = async (req, res, next) => {
    try {
        const { email, username, password } = req.body;
        let user;
        if (email === "") {
            user = await prismaClient_1.prisma.user.findFirst({
                where: { username: username },
            });
        }
        else {
            user = await prismaClient_1.prisma.user.findFirst({
                where: { email: email },
            });
        }
        if (user !== undefined && user !== null) {
            res.status(401).json({
                error: "User already exist with this username or email",
            });
            return;
        }
        const hashedPassword = await (0, bcryptUtils_1.hashPassword)(password);
        const newUser = await prismaClient_1.prisma.user.create({
            data: {
                username: username,
                email: email,
                password: hashedPassword,
            },
        });
        const userPermissions = await prismaClient_1.prisma.userPermissions.findFirst({
            where: {
                id: newUser.id,
            },
        });
        const jwtToken = (0, jwtUtils_1.createToken)(newUser.id.toString(), newUser.username, newUser.email, newUser.role);
        if (!jwtToken) {
            throw new Error("Erreur lors de la creation du token");
        }
        (0, cookieUtils_1.setAuthCookie)(res, jwtToken);
        res.status(201).json({
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
                userPermissions: userPermissions,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.register = register;
const logout = async (req, res, next) => {
    try {
        (0, cookieUtils_1.clearAuthCookie)(res);
        res.status(200).json({ message: "Deconnexion reussie" });
    }
    catch (error) {
        next(error);
    }
};
exports.logout = logout;
const me = async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: "Non authentifie" });
            return;
        }
        const userPermissions = await prismaClient_1.prisma.userPermissions.findFirst({
            where: { userId: req.user.id },
        });
        res.json({
            user: {
                id: req.user.id,
                username: req.user.username,
                email: req.user.email,
                role: req.user.role,
                userPermissions,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.me = me;
