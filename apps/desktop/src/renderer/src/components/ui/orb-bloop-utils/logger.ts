export const logger = {
  error: (...args: unknown[]) => console.error("[OrbBloop]", ...args),
  warn: (...args: unknown[]) => console.warn("[OrbBloop]", ...args),
  info: (...args: unknown[]) => console.info("[OrbBloop]", ...args),
};

