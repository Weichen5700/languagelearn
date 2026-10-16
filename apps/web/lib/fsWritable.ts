import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 逐層建立目錄。刻意不使用 `mkdirSync(..., { recursive: true })`：
 * 某些特殊掛載（例如 WSL 的 `/proc`）在 recursive 模式下會卡住不返回，
 * 逐層建立則會立即得到錯誤。遞迴深度等於路徑層級，必然終止。
 */
export function ensureDir(dir: string): void {
  if (existsSync(dir)) return;
  const parent = dirname(dir);
  if (parent === dir) throw new Error(`無法建立目錄：${dir}`);
  ensureDir(parent);
  mkdirSync(dir);
}

/** 探測目錄是否可建立／寫入，且不留下痕跡。 */
export function canWriteDir(dir: string): boolean {
  try {
    ensureDir(dir);
    const probe = join(dir, ".write-probe");
    writeFileSync(probe, "");
    rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
