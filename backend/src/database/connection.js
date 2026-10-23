const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

// Garante que o diretório de dados e o diretório de anexos existam
const dbDir = path.dirname(config.database.sqlitePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

if (!fs.existsSync(config.storage.attachmentsDir)) {
  fs.mkdirSync(config.storage.attachmentsDir, { recursive: true });
}

let dbInstance = null;

function getDatabase() {
  if (dbInstance) return dbInstance;

  dbInstance = new DatabaseSync(config.database.sqlitePath);
  
  // Habilita chaves estrangeiras e WAL mode no SQLite
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA journal_mode = WAL;');

  // Inicializa o schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    dbInstance.exec(schemaSql);
  }

  return dbInstance;
}

const db = {
  getRawDb: getDatabase,

  all(sql, params = []) {
    const database = getDatabase();
    const stmt = database.prepare(sql);
    return stmt.all(...params);
  },

  get(sql, params = []) {
    const database = getDatabase();
    const stmt = database.prepare(sql);
    return stmt.get(...params);
  },

  run(sql, params = []) {
    const database = getDatabase();
    const stmt = database.prepare(sql);
    return stmt.run(...params);
  },

  exec(sql) {
    const database = getDatabase();
    return database.exec(sql);
  },

  transaction(callback) {
    const database = getDatabase();
    database.exec('BEGIN IMMEDIATE;');
    try {
      const result = callback(db);
      database.exec('COMMIT;');
      return result;
    } catch (err) {
      database.exec('ROLLBACK;');
      throw err;
    }
  }
};

module.exports = db;
