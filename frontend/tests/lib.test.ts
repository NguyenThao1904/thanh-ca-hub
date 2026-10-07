import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { query } from "@/api/client";
import { checkFile, detectMimeType } from "@/lib/files";
import { createTranslator } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/messages/en";
import { vi } from "@/lib/i18n/messages/vi";
import { libraryHref, readLibraryParams } from "@/lib/library";
import { binderNumbers, formatLocation, formatPage, songLabel } from "@/lib/location";
import { parseWholeNumber, safeRedirectPath } from "@/lib/utils";

describe("location codes", () => {
  it("pads pages to at least two digits", () => {
    expect([1, 2, 9, 10, 25, 100].map(formatPage)).toEqual(["01", "02", "09", "10", "25", "100"]);
  });

  it("formats CODE-binder.page", () => {
    expect(formatLocation("NL", 1, 1)).toBe("NL-1.01");
    expect(formatLocation("ĐC", 3, 15)).toBe("ĐC-3.15");
    expect(formatLocation("PS", 4, 12)).toBe("PS-4.12");
  });

  it("lists the binders of a category", () => {
    expect(binderNumbers(1)).toEqual([1]);
    expect(binderNumbers(5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("builds the delete confirmation label", () => {
    expect(songLabel({ songNumber: 125, title: "Xin Dâng Lời Cảm Tạ", location: "DL-1.03" })).toBe(
      "#125 – Xin Dâng Lời Cảm Tạ (DL-1.03)",
    );
    expect(songLabel({ songNumber: null, title: "Con Hân Hoan", location: "NL-1.01" })).toBe("NL-1.01 – Con Hân Hoan");
  });
});

describe("file rules", () => {
  it("accepts the allowed types and infers missing MIME types", () => {
    expect(checkFile({ name: "page-1.jpg", type: "image/jpeg", size: 1000 }, "image")).toBeNull();
    expect(checkFile({ name: "page-1.WEBP", type: "", size: 1000 }, "image")).toBeNull();
    expect(checkFile({ name: "song.pdf", type: "application/octet-stream", size: 1000 }, "pdf")).toBeNull();
    expect(detectMimeType({ name: "scan.JPEG", type: "" })).toBe("image/jpeg");
  });

  it("rejects other types and files that are too large", () => {
    expect(checkFile({ name: "photo.heic", type: "image/heic", size: 1000 }, "image")?.problem).toBe("type");
    expect(checkFile({ name: "doc.docx", type: "", size: 1000 }, "pdf")?.problem).toBe("type");
    expect(checkFile({ name: "big.pdf", type: "application/pdf", size: 30 * 1024 * 1024 }, "pdf")?.problem).toBe("size");
  });
});

describe("library URLs", () => {
  const categories = [
    { id: 1, binderCount: 1 },
    { id: 2, binderCount: 5 },
  ];
  const read = (search: string) => readLibraryParams((name) => new URLSearchParams(search).get(name) ?? undefined, categories);

  it("builds library URLs and drops pointless parameters", () => {
    expect(libraryHref({})).toBe("/songs");
    expect(libraryHref({ q: "duc me", category: 5, binder: 2, page: 1 })).toBe("/songs?q=duc+me&category=5&binder=2");
    expect(libraryHref({ binder: 2 })).toBe("/songs");
    expect(libraryHref({ sort: "relevance" })).toBe("/songs");
    expect(libraryHref({ sort: "title_asc", page: 3 })).toBe("/songs?sort=title_asc&page=3");
  });

  it("reads the URL: best match while searching, shelf order otherwise", () => {
    expect(read("").sort).toBe("location");
    expect(read("q=nl-1").sort).toBe("relevance");
    expect(read("q=nl-1&sort=title_desc").sort).toBe("title_desc");
    expect(read("sort=relevance").explicitSort).toBeNull();
  });

  it("ignores unknown categories, binders a category does not have, and bad pages", () => {
    expect(read("category=99").category).toBeNull();
    expect(read("category=2&binder=4").binder).toBe(4);
    expect(read("category=2&binder=6").binder).toBeNull();
    expect(read("binder=2").binder).toBeNull();
    expect(read("page=abc").page).toBe(1);
  });

  it("builds API query strings without empty values", () => {
    expect(query({ q: "", category: null, page: 2, sort: "location" })).toBe("?page=2&sort=location");
    expect(query({})).toBe("");
  });
});

describe("helpers", () => {
  it("parses whole numbers only", () => {
    expect(parseWholeNumber("125")).toBe(125);
    expect(parseWholeNumber(" 7 ")).toBe(7);
    expect(parseWholeNumber("1.5")).toBeNull();
    expect(parseWholeNumber("abc")).toBeNull();
    expect(parseWholeNumber("")).toBeNull();
  });

  it("only redirects inside the app", () => {
    expect(safeRedirectPath("/songs/1")).toBe("/songs/1");
    expect(safeRedirectPath("https://evil.example")).toBe("/songs");
    expect(safeRedirectPath("//evil.example")).toBe("/songs");
    expect(safeRedirectPath("/\\evil.example")).toBe("/songs");
    expect(safeRedirectPath(null)).toBe("/songs");
  });
});

describe("translations", () => {
  it("has the same keys in Vietnamese and English, none empty", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of [...Object.entries(en), ...Object.entries(vi)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("uses the same placeholders in both languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(vi[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("fills placeholders and picks singular forms", () => {
    const t = createTranslator("en");
    expect(t("library.count", { count: 1, total: "1" })).toBe("1 song");
    expect(t("library.count", { count: 1248, total: "1,248" })).toBe("1,248 songs");
    expect(t("errors.duplicateNumber", { number: 125 })).toBe("Song number 125 already exists.");
    expect(t("errors.duplicateLocation", { location: "NL-1.01" })).toBe("Location NL-1.01 is already assigned to another song.");
    expect(createTranslator("vi")("library.empty.noResults", { query: "abc" })).toBe("Không tìm thấy bài hát nào cho 'abc'.");
  });

  it("has a message for every error the Python API can return", () => {
    const backend = path.resolve(import.meta.dirname, "../../backend/thanhca");
    const files = readdirSync(backend, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".py"));
    const keys = new Set<string>();
    for (const file of files) {
      const source = readFileSync(path.join(backend, file), "utf8");
      for (const match of source.matchAll(/"((?:errors|login)\.[A-Za-z]+)"/g)) keys.add(match[1]);
    }
    expect(keys.size).toBeGreaterThan(25);
    for (const key of keys) expect(Object.keys(en), key).toContain(key);
  });
});
