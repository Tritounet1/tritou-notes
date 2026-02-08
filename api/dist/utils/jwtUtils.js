"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeToken = exports.createToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config/config"));
const createToken = (id, username, email, role) => {
    if (config_1.default.secretKey === "") {
        // TODO: must need to return a error cause SECRET_KEY is not in env ):
        return;
    }
    const token = jsonwebtoken_1.default.sign({ id: id, username: username, email: email, role: role }, config_1.default.secretKey, {
        expiresIn: "2 days",
    });
    return token;
};
exports.createToken = createToken;
const decodeToken = (token) => {
    if (!config_1.default.secretKey) {
        // TODO: must need to return a error cause SECRET_KEY is not in env ):
        return;
    }
    const decoded = jsonwebtoken_1.default.verify(token, config_1.default.secretKey);
    return decoded;
};
exports.decodeToken = decodeToken;
