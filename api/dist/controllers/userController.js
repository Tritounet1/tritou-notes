"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.getUserById = exports.getUsers = exports.createUser = void 0;
const prismaClient_1 = require("../config/prismaClient");
const createUser = async (req, res, next) => {
    try {
        const { email, username, password } = req.body;
        const user = await prismaClient_1.prisma.user.create({
            data: {
                email: email,
                username: username,
                password: password,
            },
        });
        await prismaClient_1.prisma.userPermissions.create({
            data: {
                user: {
                    connect: {
                        id: user.id,
                    },
                },
            },
        });
        res.status(201).json(user);
    }
    catch (error) {
        next(error);
    }
};
exports.createUser = createUser;
const getUsers = async (req, res, next) => {
    try {
        const users = await prismaClient_1.prisma.user.findMany();
        res.json(users);
    }
    catch (error) {
        next(error);
    }
};
exports.getUsers = getUsers;
const getUserById = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const user = await prismaClient_1.prisma.user.findUnique({
            where: {
                id: id,
            },
        });
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        res.json(user);
    }
    catch (error) {
        next(error);
    }
};
exports.getUserById = getUserById;
const updateUser = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { email, username, password } = req.body;
        const user = await prismaClient_1.prisma.user.update({
            where: {
                id: id,
            },
            data: {
                email: email,
                username: username,
                password: password,
            },
        });
        res.json(user);
    }
    catch (error) {
        next(error);
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const deletedUser = await prismaClient_1.prisma.user.delete({
            where: {
                id: id,
            },
        });
        res.json(deletedUser);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteUser = deleteUser;
