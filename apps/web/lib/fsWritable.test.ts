import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, chmodSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canWriteDir, ensureDir } from "./fsWritable";

const canTestReadOnly = typeof process.getuid === "function" && process.getuid() !== 0;
const created: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "ll-fswritable-"));
  created.push(dir);
  chmodSync(dir, 0o755);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ensureDir / canWriteDir", () => {
  it("逐層建立不存在的目錄", () => {
    const root = tempRoot();
    const target = join(root, "a", "b", ".keys");
    ensureDir(target);
    expect(existsSync(target)).toBe(true);
    expect(statSync(target).isDirectory()).toBe(true);
    ensureDir(target); // 已存在時應為 no-op
  });

  it("可寫目錄回報 true，且不留下探測檔", () => {
    const root = tempRoot();
    const target = join(root, "capture");
    expect(canWriteDir(target)).toBe(true);
    expect(existsSync(join(target, ".write-probe"))).toBe(false);
  });

  it.skipIf(!canTestReadOnly)("唯讀目錄回報 false", () => {
    const root = tempRoot();
    chmodSync(root, 0o555);
    expect(canWriteDir(join(root, "nested"))).toBe(false);
  });

  it.skipIf(process.platform !== "linux")("特殊掛載（/proc）不卡住並回報 false", () => {
    expect(canWriteDir("/proc/languagelearn-write-probe/nested")).toBe(false);
  });
});
