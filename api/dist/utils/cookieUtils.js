"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAuthCookie = exports.setAuthCookie = void 0;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const setAuthCookie = (res, token) => {
    res.cookie("auth_token", token, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: IS_PRODUCTION ? "strict" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
        path: "/",
    });
};
exports.setAuthCookie = setAuthCookie;
const clearAuthCookie = (res) => {
    res.cookie("auth_token", "", {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: IS_PRODUCTION ? "strict" : "lax",
        maxAge: 0,
        path: "/",
    });
};
exports.clearAuthCookie = clearAuthCookie;
