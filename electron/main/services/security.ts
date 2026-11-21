import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const SECRET_SALT = "nusa-blogger-automation-v1-salt";

function getEncryptionKey(secretSeed?: string): Buffer {
  const seed =
    secretSeed ||
    process.env.NUSA_MASTER_KEY ||
    "nusa-blogger-win11-enterprise-default-master-key-2026";
  return scryptSync(seed, SECRET_SALT, 32);
}

/**
 * Encrypts sensitive strings (Google OAuth tokens, OpenAI API keys) using AES-256-GCM.
 */
export function encryptSecret(plainText: string, secretSeed?: string): string {
  if (!plainText) return "";
  const key = getEncryptionKey(secretSeed);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts AES-256-GCM encrypted strings.
 */
export function decryptSecret(cipherText: string | null | undefined, secretSeed?: string): string {
  if (!cipherText) return "";
  const parts = cipherText.split(":");
  if (parts.length !== 3) return "";
  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getEncryptionKey(secretSeed);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, "hex")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

export function maskSecret(secret: string | null | undefined): string {
  if (!secret || secret.length < 8) return "••••••••";
  return `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`;
}

/**
 * Computes deterministic SHA-256 hash of normalized HTML content for change detection.
 */
export function computeContentHash(title: string, contentHtml: string): string {
  const normalized = `${title.trim()}\n${(contentHtml || "").replace(/\s+/g, " ").trim()}`;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export type UserRole = "owner" | "admin" | "editor" | "viewer";
export type PermissionAction =
  | "workspace:manage"
  | "team:manage"
  | "account:connect"
  | "blog:manage"
  | "article:write"
  | "article:publish"
  | "article:rollback"
  | "schedule:manage"
  | "settings:manage"
  | "backup:manage"
  | "read:all";

const ROLE_PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  owner: [
    "workspace:manage",
    "team:manage",
    "account:connect",
    "blog:manage",
    "article:write",
    "article:publish",
    "article:rollback",
    "schedule:manage",
    "settings:manage",
    "backup:manage",
    "read:all"
  ],
  admin: [
    "team:manage",
    "account:connect",
    "blog:manage",
    "article:write",
    "article:publish",
    "article:rollback",
    "schedule:manage",
    "settings:manage",
    "backup:manage",
    "read:all"
  ],
  editor: ["article:write", "article:publish", "read:all"],
  viewer: ["read:all"]
};

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  const allowed = ROLE_PERMISSIONS[role] || [];
  return allowed.includes(action);
}

export function assertPermission(role: UserRole, action: PermissionAction): void {
  if (!hasPermission(role, action)) {
    throw new Error(`Akses ditolak: Role '${role}' tidak memiliki izin untuk '${action}'.`);
  }
}

/**
 * Formats a Date or ISO timestamp in Asia/Jakarta timezone.
 */
export function formatJakartaTime(dateInput: Date | string = new Date()): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return String(dateInput);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date) + " WIB";
}

export function getJakartaDateKey(dateInput: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(dateInput);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function computeNextRunIso(frequencyMinutes: number, fromDate: Date = new Date()): string {
  const mins = Math.max(5, frequencyMinutes);
  return new Date(fromDate.getTime() + mins * 60 * 1000).toISOString();
}
