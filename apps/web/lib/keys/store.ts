import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * 後端 API Key 託管：使用者在網站 UI 貼上的 Key 以 AES-256-GCM 加密存於本機檔案，
 * 前端永遠拿不到明文（只回傳「已設定 / 未設定」遮罩狀態）。
 *
 * - master key：首次使用時隨機產生 32 bytes，存 `data/.keys/master.key`（chmod 600）。
 * - keys 檔：`data/.keys/keys.enc`，內容 `{ iv, ct, tag }`（皆 base64）。
 * - 環境變數作為 fallback：store 沒有時讀 `process.env[NAME]`（相容既有 .env.local）。
 *
 * 單機單使用者情境；master key 與密文同機，屬「靜態加密（encryption at rest）」，
 * 防的是誤入庫 / 误拷貝，而非防本機 root。真要更高安全可改為使用者主密碼衍生。
 */

const STORE_DIR = join(process.cwd(), "..", "..", "data", ".keys");
const MASTER_FILE = join(STORE_DIR, "master.key");
const KEYS_FILE = join(STORE_DIR, "keys.enc");

/** 已知 Key 清單（UI 顯示用 meta）。未列在這也可透過 store 存取。 */
export interface KeyMeta {
  name: string;        // 環境變數名 / store key
  label: string;       // 顯示名
  description: string; // 說明
  link?: string;       // 取得 Key 的說明連結
}

export const KNOWN_KEYS: KeyMeta[] = [
  {
    name: "GOOGLE_API_KEY",
    label: "Google Cloud API Key",
    description: "翻譯（Cloud Translation API）+ TTS（Text-to-Speech）。有則優先使用 Google；無則降級 LibreTranslate + 瀏覽器 TTS。",
    link: "https://console.cloud.google.com/google/maps-apis/credentials",
  },
  {
    name: "DEEPL_API_KEY",
    label: "DeepL API Key",
    description: "（預留）DeepL 翻譯，目前 provider 尚未接，保留欄位供未來啟用。",
  },
  {
    name: "LIBRETRANSLATE_ENDPOINT",
    label: "LibreTranslate Endpoint",
    description: "自架 / 公用 LibreTranslate 網址（非 Key，而是 endpoint URL）。免費降級翻譯來源。",
  },
];

let cachedMaster: Buffer | null = null;

function ensureMasterKey(): Buffer {
  if (cachedMaster) return cachedMaster;
  mkdirSync(STORE_DIR, { recursive: true });
  if (existsSync(MASTER_FILE)) {
    cachedMaster = Buffer.from(readFileSync(MASTER_FILE, "utf8").trim(), "hex");
    if (cachedMaster.length === 32) return cachedMaster;
  }
  cachedMaster = randomBytes(32);
  writeFileSync(MASTER_FILE, cachedMaster.toString("hex"), { mode: 0o600 });
  try { chmodSync(MASTER_FILE, 0o600); } catch { /* best effort */ }
  return cachedMaster;
}

interface EncryptedStore {
  iv: string;   // base64
  ct: string;   // base64
  tag: string;  // base64
}

function loadStore(): Record<string, string> {
  if (!existsSync(KEYS_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(KEYS_FILE, "utf8")) as EncryptedStore;
    const key = ensureMasterKey();
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const ct = Buffer.from(raw.ct, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    return JSON.parse(pt) as Record<string, string>;
  } catch {
    return {}; // 檔案毀損則視為空，不讓 API 整個壞掉
  }
}

function saveStore(map: Record<string, string>): void {
  mkdirSync(STORE_DIR, { recursive: true });
  const key = ensureMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(map), "utf8");
  const enc = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedStore = {
    iv: iv.toString("base64"),
    ct: enc.toString("base64"),
    tag: tag.toString("base64"),
  };
  writeFileSync(KEYS_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
  try { chmodSync(KEYS_FILE, 0o600); } catch { /* best effort */ }
}

/** 取得 Key 明文（僅後端 service 使用）。先讀 store，沒有再 fallback env。 */
export function getKey(name: string): string | null {
  const store = loadStore();
  const v = store[name];
  if (v && v.length > 0) return v;
  const env = process.env[name];
  return env && env.length > 0 ? env : null;
}

/** 設定 / 刪除 Key（value 為空字串則刪除）。 */
export function setKey(name: string, value: string): void {
  const store = loadStore();
  const v = value.trim();
  if (v.length === 0) {
    delete store[name];
  } else {
    store[name] = v;
  }
  saveStore(store);
}

export function deleteKey(name: string): void {
  const store = loadStore();
  delete store[name];
  saveStore(store);
}

export interface KeyStatus {
  name: string;
  label: string;
  description: string;
  link?: string;
  set: boolean;       // store 或 env 任一有值
  source: "store" | "env" | "none";
}

/** 遮罩清單（前端用）：只回傳是否設定 + 來源，永不回傳明文。 */
export function listKeyStatuses(): KeyStatus[] {
  const store = loadStore();
  return KNOWN_KEYS.map((k) => {
    const inStore = !!store[k.name];
    const inEnv = !!(process.env[k.name] && process.env[k.name]!.length > 0);
    return {
      name: k.name,
      label: k.label,
      description: k.description,
      link: k.link,
      set: inStore || inEnv,
      source: inStore ? "store" : inEnv ? "env" : "none",
    };
  });
}