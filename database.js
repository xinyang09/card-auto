import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = './redeem_history.db';

let db = null;
let SQL = null;

export async function initDatabase() {
  try {
    SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      console.log('数据库已加载:', DB_PATH);
    } else {
      db = new SQL.Database();
      console.log('新数据库已创建');
    }
    
    createTables();
    saveDatabase();
    
    return true;
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return false;
  }
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS redeem_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cdk TEXT NOT NULL,
      order_no TEXT,
      category_name TEXT,
      card_number TEXT,
      expiry TEXT,
      cvv TEXT,
      phone TEXT,
      holder_name TEXT,
      address TEXT,
      street_address TEXT,
      city_state_zip TEXT,
      state TEXT,
      country TEXT,
      verification_url TEXT,
      instruction TEXT,
      is_first_assignment INTEGER,
      redeemed_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cdk TEXT NOT NULL,
      code TEXT,
      fetched_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function saveRedeemHistory(record) {
  try {
    const stmt = db.prepare(`
      INSERT INTO redeem_history (
        cdk, order_no, category_name, card_number, expiry, cvv,
        phone, holder_name, address, street_address, city_state_zip,
        state, country, verification_url, instruction, is_first_assignment, redeemed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([
      record.cdk,
      record.orderNo,
      record.categoryName,
      record.cardNumber,
      record.expiry,
      record.cvv,
      record.phone,
      record.holderName,
      record.address,
      record.streetAddress,
      record.cityStateZip,
      record.state || '-',
      record.country,
      record.verificationUrl,
      record.instruction,
      record.isFirstAssignment ? 1 : 0,
      record.redeemedAt || new Date().toISOString()
    ]);
    
    stmt.free();
    saveDatabase();
    
    return db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  } catch (error) {
    console.error('保存兑换记录失败:', error);
    return null;
  }
}

export function updateRedeemHistoryState(cdk, state, cityStateZip, address) {
   try {
     const stmt = db.prepare(`
       UPDATE redeem_history SET state = ?, city_state_zip = ?, address = ? WHERE cdk = ?
     `);
     
     stmt.run([state, cityStateZip, address, cdk]);
     stmt.free();
     saveDatabase();
     
     return true;
   } catch (error) {
     console.error('更新兑换记录州信息失败:', error);
     return false;
   }
 }

export function saveVerificationCode(cdk, code) {
  try {
    const stmt = db.prepare(`
      INSERT INTO verification_codes (cdk, code, fetched_at)
      VALUES (?, ?, ?)
    `);
    
    stmt.run([
      cdk,
      code,
      new Date().toISOString()
    ]);
    
    stmt.free();
    saveDatabase();
    
    return true;
  } catch (error) {
    console.error('保存验证码失败:', error);
    return false;
  }
}

export function getRedeemHistory(limit = 100, offset = 0) {
  try {
    const results = db.exec(`
      SELECT * FROM redeem_history
      ORDER BY redeemed_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    
    if (results.length === 0) {
      return [];
    }
    
    const columns = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      obj.isFirstAssignment = obj.is_first_assignment === 1;
      delete obj.is_first_assignment;
      return obj;
    });
  } catch (error) {
    console.error('查询兑换历史失败:', error);
    return [];
  }
}

export function getRedeemRecordByCDK(cdk) {
  try {
    const results = db.exec(`
      SELECT * FROM redeem_history
      WHERE cdk = '${cdk.replace(/'/g, "''")}'
      ORDER BY redeemed_at DESC
      LIMIT 1
    `);
    
    if (results.length === 0 || results[0].values.length === 0) {
      return null;
    }
    
    const columns = results[0].columns;
    const row = results[0].values[0];
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    obj.isFirstAssignment = obj.is_first_assignment === 1;
    delete obj.is_first_assignment;
    return obj;
  } catch (error) {
    console.error('查询CDK兑换记录失败:', error);
    return null;
  }
}

export function getVerificationCodes(cdk) {
  try {
    const stmt = db.prepare(`
      SELECT * FROM verification_codes
      WHERE cdk = ?
      ORDER BY fetched_at DESC
    `);
    
    stmt.bind([cdk]);
    
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    
    stmt.free();
    return results;
  } catch (error) {
    console.error('查询验证码失败:', error);
    return [];
  }
}

function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (error) {
    console.error('保存数据库失败:', error);
  }
}

export function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
