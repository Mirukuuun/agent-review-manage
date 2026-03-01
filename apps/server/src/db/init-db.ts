import { createDatabase } from "./database.js";

export function initDatabase(dbPath: string) {
  return createDatabase(dbPath);
}
