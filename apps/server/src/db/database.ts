import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "./schema.sql");

export function createDatabase(dbPath: string): DatabaseSync {
  const absolutePath = resolve(dbPath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  const db = new DatabaseSync(absolutePath);
  const schemaSql = readFileSync(schemaPath, "utf8");
  db.exec(schemaSql);
  return db;
}
