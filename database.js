import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, "redeem_history.csv");
const LEGACY_DB_PATH = path.join(__dirname, "redeem_history.db");

const CSV_COLUMNS = [
  "id",
  "cdk",
  "order_no",
  "category_name",
  "card_number",
  "expiry",
  "cvv",
  "phone",
  "holder_name",
  "address",
  "street_address",
  "city_state_zip",
  "state",
  "country",
  "verification_url",
  "instruction",
  "is_first_assignment",
  "activated_at",
  "expires_at",
  "redeemed_at",
  "created_at",
];

let historyRecords = [];

export async function initDatabase() {
  try {
    if (!fs.existsSync(CSV_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
      await migrateLegacySqliteToCsv();
    }

    ensureCsvFile();
    historyRecords = loadCsvRecords();
    console.log("兑换历史 CSV 已加载:", CSV_PATH);
    return true;
  } catch (error) {
    console.error("兑换历史存储初始化失败:", error);
    return false;
  }
}

export function saveRedeemHistory(record) {
  try {
    const createdAt = new Date().toISOString();
    const normalizedRecord = normalizeRecord({
      id: getNextId(),
      cdk: record.cdk,
      order_no: record.orderNo,
      category_name: record.categoryName,
      card_number: record.cardNumber,
      expiry: record.expiry,
      cvv: record.cvv,
      phone: record.phone,
      holder_name: record.holderName,
      address: record.address,
      street_address: record.streetAddress,
      city_state_zip: record.cityStateZip,
      state: record.state || "-",
      country: record.country,
      verification_url: record.verificationUrl,
      instruction: record.instruction,
      is_first_assignment: toBoolean(record.isFirstAssignment),
      activated_at: record.activatedAt,
      expires_at: record.expiresAt,
      redeemed_at: record.redeemedAt || createdAt,
      created_at: createdAt,
    });

    historyRecords.push(normalizedRecord);
    persistCsvRecords();
    return normalizedRecord.id;
  } catch (error) {
    console.error("保存兑换记录失败:", error);
    return null;
  }
}

export function updateRedeemHistoryState(cdk, state, cityStateZip, address) {
  try {
    let changed = false;

    historyRecords = historyRecords.map((record) => {
      if (record.cdk !== cdk) {
        return record;
      }

      changed = true;
      return normalizeRecord({
        ...record,
        state,
        city_state_zip: cityStateZip,
        address,
      });
    });

    if (changed) {
      persistCsvRecords();
    }

    return true;
  } catch (error) {
    console.error("更新兑换记录州信息失败:", error);
    return false;
  }
}

export function getRedeemHistory(limit = 100, offset = 0) {
  try {
    const sorted = sortRecordsByRedeemedAt(historyRecords);
    return sorted.slice(offset, offset + limit).map(cloneRecord);
  } catch (error) {
    console.error("查询兑换历史失败:", error);
    return [];
  }
}

export function getRedeemRecordByCDK(cdk) {
  try {
    const matched = sortRecordsByRedeemedAt(
      historyRecords.filter((record) => record.cdk === cdk),
    );
    return matched.length > 0 ? cloneRecord(matched[0]) : null;
  } catch (error) {
    console.error("查询 CDK 兑换记录失败:", error);
    return null;
  }
}

export function closeDatabase() {
  try {
    persistCsvRecords();
  } catch (error) {
    console.error("关闭兑换历史存储失败:", error);
  }
}

async function migrateLegacySqliteToCsv() {
  try {
    const { default: initSqlJs } = await import("sql.js");
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(LEGACY_DB_PATH);
    const db = new SQL.Database(buffer);
    const results = db.exec("SELECT * FROM redeem_history ORDER BY id ASC");
    db.close();

    if (results.length === 0) {
      ensureCsvFile();
      console.log("旧 SQLite 兑换历史为空，已创建 CSV 文件");
      return;
    }

    const [result] = results;
    const migratedRecords = result.values.map((row, index) =>
      normalizeRecord(legacyRowToRecord(result.columns, row, index + 1)),
    );

    historyRecords = migratedRecords;
    persistCsvRecords();
    console.log("已将 SQLite 兑换历史迁移到 CSV:", CSV_PATH);
  } catch (error) {
    console.error("迁移旧 SQLite 兑换历史失败:", error);
    ensureCsvFile();
  }
}

function legacyRowToRecord(columns, row, fallbackId) {
  const legacyRecord = {};

  columns.forEach((column, index) => {
    legacyRecord[column] = row[index];
  });

  return {
    id: legacyRecord.id || fallbackId,
    cdk: legacyRecord.cdk,
    order_no: legacyRecord.order_no,
    category_name: legacyRecord.category_name,
    card_number: legacyRecord.card_number,
    expiry: legacyRecord.expiry,
    cvv: legacyRecord.cvv,
    phone: legacyRecord.phone,
    holder_name: legacyRecord.holder_name,
    address: legacyRecord.address,
    street_address: legacyRecord.street_address,
    city_state_zip: legacyRecord.city_state_zip,
    state: legacyRecord.state,
    country: legacyRecord.country,
    verification_url: legacyRecord.verification_url,
    instruction: legacyRecord.instruction,
    is_first_assignment: legacyRecord.is_first_assignment,
    activated_at: legacyRecord.activated_at,
    expires_at: legacyRecord.expires_at,
    redeemed_at: legacyRecord.redeemed_at,
    created_at: legacyRecord.created_at,
  };
}

function ensureCsvFile() {
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, `${CSV_COLUMNS.join(",")}\n`, "utf8");
  }
}

function loadCsvRecords() {
  ensureCsvFile();

  const content = fs.readFileSync(CSV_PATH, "utf8");
  if (!content.trim()) {
    return [];
  }

  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    return [];
  }

  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const rawRecord = {};

    header.forEach((column, index) => {
      rawRecord[column] = values[index] ?? "";
    });

    return normalizeRecord(rawRecord);
  });
}

function persistCsvRecords() {
  ensureCsvFile();

  const rows = [
    CSV_COLUMNS.join(","),
    ...historyRecords.map((record) =>
      CSV_COLUMNS.map((column) => serializeCsvField(getPersistedValue(record, column))).join(","),
    ),
  ];

  fs.writeFileSync(CSV_PATH, `${rows.join("\n")}\n`, "utf8");
}

function getPersistedValue(record, column) {
  if (column === "is_first_assignment") {
    return record.is_first_assignment ? "1" : "0";
  }

  if (column === "id") {
    return String(record.id || "");
  }

  return record[column] ?? "";
}

function normalizeRecord(record) {
  const normalized = {};

  for (const column of CSV_COLUMNS) {
    if (column === "id") {
      normalized.id = toNumber(record.id);
      continue;
    }

    if (column === "is_first_assignment") {
      normalized.is_first_assignment = toBoolean(record.is_first_assignment);
      continue;
    }

    normalized[column] = sanitizeCsvValue(record[column]);
  }

  return normalized;
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function serializeCsvField(value) {
  const sanitized = sanitizeCsvValue(value).replace(/"/g, '""');
  return `"${sanitized}"`;
}

function sanitizeCsvValue(value) {
  return String(value ?? "").replace(/\r?\n|\r/g, " ").trim();
}

function sortRecordsByRedeemedAt(records) {
  return [...records].sort((left, right) => {
    const redeemedAtOrder = String(right.redeemed_at || "").localeCompare(String(left.redeemed_at || ""));
    if (redeemedAtOrder !== 0) {
      return redeemedAtOrder;
    }

    return Number(right.id || 0) - Number(left.id || 0);
  });
}

function cloneRecord(record) {
  return { ...record };
}

function getNextId() {
  return historyRecords.reduce((maxId, record) => Math.max(maxId, Number(record.id || 0)), 0) + 1;
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
