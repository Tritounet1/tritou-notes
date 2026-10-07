import config from "./config";

export interface ConfigNeeds {
  /** Signs session tokens (API). */
  jwt?: boolean;
  /** Encrypts the OpenRouter key and SMTP credentials (API). */
  encryption?: boolean;
}

/** What is wrong with the configuration for a service: errors stop it, warnings are logged. */
export const configProblems = (needs: ConfigNeeds, cfg = config) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!cfg.databaseUrl) errors.push("DATABASE_URL n’est pas défini.");
  if (needs.jwt) {
    if (!cfg.secretKey) errors.push("JWT_SECRET n’est pas défini (ancien nom accepté : SECRET_JTW_KEY). Générez-en un avec `openssl rand -hex 32`.");
    else if (Buffer.byteLength(cfg.secretKey) < 32) warnings.push("JWT_SECRET fait moins de 32 octets : utilisez `openssl rand -hex 32`.");
  }
  if (needs.encryption && !/^[0-9a-f]{64}$/i.test(cfg.encryptionKey)) {
    errors.push("ENCRYPTION_KEY doit faire 64 caractères hexadécimaux (`openssl rand -hex 32`). Le changer rend illisibles les secrets déjà enregistrés.");
  }
  return { errors, warnings };
};

/** Stops the process with a clear message instead of failing later on the first request. */
export const assertConfig = (service: string, needs: ConfigNeeds) => {
  const { errors, warnings } = configProblems(needs);
  for (const warning of warnings) console.warn(`[${service}] ${warning}`);
  if (errors.length === 0) return;
  for (const error of errors) console.error(`[${service}] Configuration invalide : ${error}`);
  process.exit(1);
};
