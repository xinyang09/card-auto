import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ApiClient from "./api-client.js";
import { initDatabase, saveRedeemHistory, getRedeemHistory, getRedeemRecordByCDK, updateRedeemHistoryState, closeDatabase } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFile(path.join(__dirname, ".env"));

const IS_DOCKER = existsSync("/.dockerenv");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8000);
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const DEMO_MODE = String(process.env.DEMO_MODE || "").toLowerCase() === "true";
const DEFAULT_PAYMENT_SERVICE_ORIGIN = IS_DOCKER
  ? "http://payment-python:5001,http://card-auto-payment-python:5001"
  : "http://127.0.0.1:5001";
const PAYMENT_SERVICE_ORIGINS = parseServiceOrigins(
  process.env.PAYMENT_SERVICE_ORIGIN || DEFAULT_PAYMENT_SERVICE_ORIGIN,
);
const PAYMENT_SERVICE_FETCH_RETRIES = readIntegerEnv(
  process.env.PAYMENT_SERVICE_FETCH_RETRIES,
  IS_DOCKER ? 8 : 2,
  1,
);
const PAYMENT_SERVICE_RETRY_DELAY_MS = readIntegerEnv(
  process.env.PAYMENT_SERVICE_RETRY_DELAY_MS,
  IS_DOCKER ? 1000 : 250,
  0,
);
const TUTORIAL_URL = process.env.TUTORIAL_URL || "";
const BUY_CARD_URL = process.env.BUY_CARD_URL || "";
const ENABLE_TEAM_PLAN = readBooleanEnv(process.env.ENABLE_TEAM_PLAN, true);

// 真实API配置
const REAL_API_KEY = process.env.REAL_API_KEY || "";
const REAL_API_URL = "https://cards.779.chat/open-api/web-api/redeem/submit";
const INVITER_CODE = process.env.INVITER_CODE || "";
const DEVICE_ID = process.env.DEVICE_ID || "browser-fingerprint";

const apiClient = new ApiClient();

// Notion配置已删除

const demoEntries = new Map([
  [
    "DEMO-001",
    {
      used: false,
      item: {
        orderNo: "R202604250001",
        categoryName: "4859",
        cardNumber: "4859 **** **** 2002",
        fullCardNumber: "4859 1234 5678 2002",
        expiry: "2030/06",
        fullExpiry: "06/30",
        phone: "+1******5942",
        fullPhone: "+1-555-123-5942",
        holderName: "Todd Sellers",
        address: "2555 Howerton Court, Charlotte 28270, US",
        activatedAt: "2026-04-20T09:20:00.000Z",
        expiresAt: "2030-06-01T00:00:00.000Z",
        instruction: "手机号仅用于测试中的 3DS 与消费验证码。",
        isFirstAssignment: true,
        cvv: "123",
      },
    },
  ],
  [
    "DEMO-002",
    {
      used: false,
      item: {
        orderNo: "R202604250002",
        categoryName: "5311",
        cardNumber: "5311 **** **** 4418",
        fullCardNumber: "5311 8765 4321 4418",
        expiry: "2029/12",
        fullExpiry: "12/29",
        phone: "+1******2301",
        fullPhone: "+1-555-987-2301",
        holderName: "Demo Operator",
        address: "650 South Tryon Street, Charlotte 28202, US",
        activatedAt: "2026-04-19T06:00:00.000Z",
        expiresAt: "2029-12-01T00:00:00.000Z",
        instruction: "本页仅演示脱敏展示，不返回敏感支付信息。",
        isFirstAssignment: true,
        cvv: "456",
      },
    },
  ],
  [
    "123",
    {
      used: false,
      item: {
        orderNo: "R202604200001",
        categoryName: "4859",
        deliveryContent: "4859540145252002 ---- 2030/6 ---- 381 ---- +16206215942 ---- `http://a.62-us.com/api/get_sms?key=demo`  ---- Todd Sellers ---- 2555 Howerton Court, Charlotte 28270, US",
        activatedAt: "2026-04-20T09:20:00.000Z",
        expiresAt: "2030-06-01T00:00:00.000Z",
        instruction: "此手机号仅用于接收 3DS 与消费验证码，无法用于注册任何项目。",
        isFirstAssignment: true,
      },
    },
  ],
]);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/api/status" && request.method === "GET") {
      return sendJson(response, 200, buildStatusPayload());
    }

    if (url.pathname === "/api/complete-info" && request.method === "GET") {
      return sendJson(response, 200, buildCompleteInfoPayload());
    }

    if (url.pathname === "/api/history" && request.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const history = getRedeemHistory(limit, offset);
      return sendJson(response, 200, {
        success: true,
        data: history,
        count: history.length
      });
    }

    if (url.pathname === "/api/verification" && request.method === "GET") {
      const verificationUrl = url.searchParams.get("url");
      
      if (!verificationUrl) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, message: "缺少验证码URL参数" }));
        return;
      }
      
      try {
        const verificationResponse = await fetch(verificationUrl);
        const text = await verificationResponse.text();
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: true, data: text }));
        return;
      } catch (error) {
        console.error("获取验证码失败:", error);
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, message: "获取验证码失败" }));
        return;
      }
    }

    if (url.pathname === "/api/zipcode" && request.method === "GET") {
      const zipcode = url.searchParams.get("zip");
      
      if (!zipcode) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, message: "缺少邮编参数" }));
        return;
      }
      
      try {
        // 使用 zippopotam.us API
        const zipResponse = await fetch(`https://api.zippopotam.us/us/${zipcode}`);
        
        if (zipResponse.ok) {
          const data = await zipResponse.json();
          const place = data.places[0];
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({
            success: true,
            data: {
              city: place["place name"],
              state: place.state,
              stateAbbrev: place["state abbreviation"]
            }
          }));
        } else {
          response.writeHead(404, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ success: false, message: "未找到该邮编对应的信息" }));
        }
      } catch (error) {
        console.error("查询邮编失败:", error);
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, message: "查询邮编失败" }));
      }
      return;
    }

    if (url.pathname === "/api/request" && request.method === "POST") {
      const body = await readJsonBody(request);
      const token = String(body?.token || "").trim();
      const plus = Boolean(body?.plus || false);
      
      if (!token) {
        return sendJson(response, 400, {
          status: "error",
          message: "缺少token参数"
        });
      }
      
      try {
        const { statusCode, payload } = await proxyPaymentLinkRequest(token, plus);
        return sendJson(response, statusCode, payload);
      } catch (error) {
        console.error("调用 Python 支付服务失败:", error);
        return sendJson(response, 502, {
          status: "error",
          message: "Python 支付服务不可用: " + error.message
        });
      }
    }

    if (url.pathname === "/api/redeem" && request.method === "POST") {
      const body = await readJsonBody(request);
      const cdk = String(body?.cdk || "").trim();

      if (!cdk) {
        return sendJson(response, 400, {
          message: "请输入有效的 CDK。",
        });
      }

      const mode = getRuntimeMode();
      
      try {
        let result;
        let responseMessage;
        
        if (mode === "demo") {
          // 演示模式：先检查是否为演示CDK，如果不是则尝试真实API
          if (apiClient.isDemoCDK(cdk)) {
            const demoResult = await redeemDemoEntry(cdk);
            result = demoResult.item;
            responseMessage = demoResult.message;
          } else {
            // 非演示CDK，调用真实API
            const realResult = await redeemRealCDK(cdk);
            result = realResult.item;
            responseMessage = realResult.message;
          }
        } else {
          // 演示模式（默认）
          const demoResult = await redeemDemoEntry(cdk);
          result = demoResult.item;
          responseMessage = demoResult.message;
        }

        return sendJson(response, 200, {
          mode: mode === "demo" && apiClient.isDemoCDK(cdk) ? "demo" : "real",
          message: responseMessage,
          item: result,
        });
      } catch (error) {
        if (error.statusCode) {
          return sendJson(response, error.statusCode, {
            message: error.message,
          });
        }
        
        return sendJson(response, 500, {
          message: "兑换过程中发生错误",
        });
      }
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return serveStaticFile(url.pathname, response, request.method);
    }

    return sendJson(response, 404, { message: "Not found." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendJson(response, statusCode, {
      message: error.expose ? error.message : "服务暂时不可用，请稍后重试。",
    });
  }
});

server.listen(PORT, HOST, async () => {
  const mode = getRuntimeMode();
  console.log(`Server running at http://${HOST}:${PORT} (${mode} mode)`);
  
  const dbInitialized = await initDatabase();
  if (dbInitialized) {
    console.log('兑换历史存储初始化成功');
  } else {
    console.error('兑换历史存储初始化失败，但服务器继续运行');
  }
});

function getRuntimeMode() {
  return "demo";
}

function buildStatusPayload() {
  return {
    mode: "demo",
    hint: "演示模式：支持本地演示CDK和真实API调用。",
    tutorialUrl: TUTORIAL_URL,
    buyCardUrl: BUY_CARD_URL,
    teamPlanEnabled: ENABLE_TEAM_PLAN,
  };
}

function buildCompleteInfoPayload() {
  const completeInfo = [];
  
  for (const [cdk, entry] of demoEntries.entries()) {
    if (!entry.used) {
      completeInfo.push({
        cdk: cdk,
        orderNo: entry.item.orderNo,
        categoryName: entry.item.categoryName,
        fullCardNumber: entry.item.fullCardNumber,
        fullExpiry: entry.item.fullExpiry,
        fullPhone: entry.item.fullPhone,
        holderName: entry.item.holderName,
        address: entry.item.address,
        cvv: entry.item.cvv,
        activatedAt: entry.item.activatedAt,
        expiresAt: entry.item.expiresAt,
        instruction: entry.item.instruction,
        isFirstAssignment: entry.item.isFirstAssignment
      });
    }
  }
  
  return {
    mode: getRuntimeMode(),
    completeInfo: completeInfo,
    message: "完整卡片信息（仅演示模式可用）"
  };
}

async function redeemRealCDK(cdk) {
  try {
    // 调用真实API接口
    const response = await fetch(REAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": REAL_API_KEY
      },
      body: JSON.stringify({
        redeemCode: cdk,
        inviterCode: INVITER_CODE,
        deviceId: DEVICE_ID
      })
    });
    
    const result = await response.json();
    
    if (result.code === 0 && result.data) {
      const transformedItem = transformRealPayload(result.data);
      
      // 从原始地址中提取邮编并查询州信息
      let zipcode = extractZipcode(transformedItem.cityStateZip);
      
      // 如果cityStateZip没有邮编，尝试从完整地址中提取
      if (!zipcode) {
        zipcode = extractZipcode(transformedItem.address);
      }
      
      // 如果还是没有邮编，尝试从parsed.deliveryContent中提取
      if (!zipcode && result.data.deliveryContent) {
        zipcode = extractZipcode(result.data.deliveryContent);
      }
      
      if (zipcode) {
        console.log(`提取到邮编: ${zipcode}`);
        const zipInfo = await fetchZipcodeInfo(zipcode);
        if (zipInfo) {
          console.log(`查询到州信息: ${JSON.stringify(zipInfo)}`);
          transformedItem.state = zipInfo.state;
          transformedItem.stateAbbrev = zipInfo.stateAbbrev;
          // 更新cityStateZip为完整格式: 城市 州缩写 邮编
          transformedItem.cityStateZip = `${zipInfo.city} ${zipInfo.stateAbbrev} ${zipcode}`;
          
          // 更新完整地址格式: 街道, 城市 州缩写 邮编, 国家
          const addressParts = transformedItem.address ? transformedItem.address.split(',') : [];
          if (addressParts.length >= 2) {
            const street = addressParts[0].trim();
            const country = addressParts[addressParts.length - 1].trim();
            transformedItem.address = `${street}, ${transformedItem.cityStateZip}, ${country}`;
          }
        } else {
          console.log(`未查询到邮编 ${zipcode} 对应的州信息`);
        }
      } else {
        console.log(`未能从地址中提取邮编，cityStateZip: ${transformedItem.cityStateZip}, address: ${transformedItem.address}`);
      }
      
      saveToDatabase(cdk, transformedItem);
      return {
        mode: "real",
        message: "兑换成功",
        item: transformedItem,
      };
    } else {
      // API返回错误
      const errorMessage = getErrorMessage(response.status, result);
      throw createHttpError(response.status || 400, errorMessage, true);
    }
  } catch (error) {
    console.error("Real CDK redemption failed:", error);
    
    // 处理网络错误或配置错误
    let errorMessage = error.message;
    
    if (errorMessage.includes("fetch failed")) {
      if (!REAL_API_KEY) {
        errorMessage = "未配置API Key，请在.env文件中设置REAL_API_KEY。";
      } else {
        errorMessage = "无法连接到兑换服务器，请检查网络连接。";
      }
    }
    
    throw createHttpError(404, errorMessage, true);
  }
}

// 根据错误码获取友好的错误消息
function getErrorMessage(status, result) {
  const message = result?.message || "";
  
  // 如果API返回了明确的错误消息，直接使用
  if (message && message !== "ok") {
    return message;
  }
  
  // 根据HTTP状态码返回错误消息
  switch (status) {
    case 400:
      return "请求参数缺失、格式错误，或业务条件不满足。";
    case 401:
      return "API Key无效，或当前业务接口要求登录态但未提供Authorization。";
    case 404:
      return "请求路径不存在，或按参数查询不到对应业务记录。";
    case 429:
      return "请求过于频繁，请稍后重试。";
    case 500:
      return "服务内部异常，请稍后重试。";
    default:
      return result?.error || "兑换失败，请稍后重试。";
  }
}

async function redeemDemoEntry(cdk) {
  // 先查询数据库是否有该CDK的兑换记录
  const existingRecord = getRedeemRecordByCDK(cdk);
  
  if (existingRecord) {
    // 如果数据库中有记录，检查是否过期
    const expiresAt = new Date(existingRecord.expires_at);
    const now = new Date();
    
    // 转换数据库记录为显示格式
    let item = {
      orderNo: existingRecord.order_no,
      categoryName: existingRecord.category_name,
      fullCardNumber: existingRecord.card_number,
      fullExpiry: existingRecord.expiry,
      cvv: existingRecord.cvv,
      fullPhone: existingRecord.phone,
      holderName: existingRecord.holder_name,
      address: existingRecord.address,
      streetAddress: existingRecord.street_address,
      cityStateZip: existingRecord.city_state_zip,
      state: existingRecord.state || '-',
      country: existingRecord.country,
      verificationUrl: existingRecord.verification_url,
      instruction: existingRecord.instruction,
      isFirstAssignment: existingRecord.is_first_assignment,
      activatedAt: existingRecord.activated_at,
      expiresAt: existingRecord.expires_at,
      redeemedAt: existingRecord.redeemed_at,
      isExpired: expiresAt < now
    };
    
    // 检查地址是否需要更新（缺少州缩写）
    const addressHasStateAbbrev = item.address && /\b[A-Z]{2}\s+\d{5}/.test(item.address);
    
    if (!addressHasStateAbbrev) {
      let zipcode = extractZipcode(item.cityStateZip);
      if (!zipcode) {
        zipcode = extractZipcode(item.address);
      }
      
      if (zipcode) {
        const zipInfo = await fetchZipcodeInfo(zipcode);
        if (zipInfo) {
          item.state = zipInfo.state;
          item.stateAbbrev = zipInfo.stateAbbrev;
          item.cityStateZip = `${zipInfo.city} ${zipInfo.stateAbbrev} ${zipcode}`;
          
          // 更新完整地址格式: 街道, 城市 州缩写 邮编, 国家
          const addressParts = item.address ? item.address.split(',') : [];
          if (addressParts.length >= 2) {
            const street = addressParts[0].trim();
            const country = addressParts[addressParts.length - 1].trim();
            item.address = `${street}, ${item.cityStateZip}, ${country}`;
          }
          
          // 更新数据库中的州信息和地址
          updateRedeemHistoryState(cdk, zipInfo.state, item.cityStateZip, item.address);
        }
      }
    }
    
    // 如果是"123"CDK，允许重复使用，否则检查是否已使用
    if (cdk !== "123" && !existingRecord.is_first_assignment) {
      throw createHttpError(409, "该 CDK 已被使用。", true);
    }
    
    return {
      mode: "demo",
      message: item.isExpired ? "兑换记录（已过期）" : "兑换成功（从历史记录恢复）",
      item: item
    };
  }
  
  const entry = demoEntries.get(cdk);

  if (!entry) {
    // 如果不是演示CDK，尝试真实CDK验证
    if (!apiClient.isDemoCDK(cdk)) {
      throw createHttpError(404, "未找到对应的 CDK。", true);
    }
    
    // 如果是演示CDK但不在列表中，也返回错误
    throw createHttpError(404, "未找到对应的 CDK。", true);
  }

  // 特殊处理：兑换码 "123" 可以重复使用
  if (entry.used && cdk !== "123") {
    throw createHttpError(409, "该 CDK 已被使用。", true);
  }

  // 只有非 "123" 的兑换码才会被标记为已使用
  if (cdk !== "123") {
    entry.used = true;
  }
  
  const sanitizedItem = sanitizePayload(entry.item);
  
  // 保存到数据库
  saveToDatabase(cdk, sanitizedItem);
  
  return {
    mode: "demo",
    message: "演示兑换成功，已将该 CDK 标记为已使用。",
    item: sanitizedItem,
  };
}

// 解析地址信息
function parseAddressInfo(address) {
  if (!address) {
    return {
      street: "-",
      state: "-",
      city: "-",
      zip: "-",
      cityStateZip: "-",
      country: "-"
    };
  }
  
  // 尝试多种地址格式
  
  // 格式1: 街道, 城市 州 邮编, 国家 (例如: "2555 Howerton Court, Charlotte 28270, US")
  // 格式2: 街道, 城市, 州 邮编, 国家 (例如: "12801 COPPER AVE NE D34, ALBUQUERQUE, NM 87123, US")
  // 格式3: 街道, 城市州邮编, 国家
  
  // 首先检查是否有多个逗号
  const parts = address.split(",").map(p => p.trim());
  
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1]; // 国家
    const street = parts[0]; // 街道
    const middle = parts.slice(1, -1).join(", "); // 城市州邮编
    
    // 尝试解析中间部分
    const middleParts = middle.split(/\s+(?=[A-Z]{2}\s|\s[A-Z]{2}$)/);
    
    let city = "-";
    let state = "-";
    let zip = "-";
    
    if (middleParts.length >= 2) {
      // 找到州和邮编
      const lastMiddlePart = middleParts[middleParts.length - 1];
      
      // 尝试匹配州缩写 + 邮编
      const stateZipMatch = lastMiddlePart.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)/i);
      if (stateZipMatch) {
        state = stateZipMatch[1];
        zip = stateZipMatch[2];
        city = middleParts.slice(0, -1).join(" ");
      } else {
        // 没有找到州邮编，尝试匹配城市 + 邮编
        const cityZipMatch = middle.match(/^(.+?)\s+(\d{5}(-\d{4})?)$/);
        if (cityZipMatch) {
          city = cityZipMatch[1];
          zip = cityZipMatch[2];
          state = "-";
        } else {
          city = middle;
        }
      }
    } else {
      // 中间只有一个部分
      const singlePart = middle.trim();
      
      // 尝试匹配州缩写 + 邮编
      const stateZipMatch = singlePart.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)/i);
      if (stateZipMatch) {
        state = stateZipMatch[1];
        zip = stateZipMatch[2];
        city = "-";
      } else {
        city = singlePart;
      }
    }
    
    return {
      street: street,
      state: state,
      city: city,
      zip: zip,
      cityStateZip: state !== "-" ? `${city} ${state} ${zip}` : (city !== "-" ? city : "-"),
      country: lastPart
    };
  } else if (parts.length === 1) {
    // 只有一个部分，尝试解析
    const single = parts[0].trim();
    
    // 尝试匹配州缩写 + 邮编
    const stateZipMatch = single.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)/i);
    if (stateZipMatch) {
      return {
        street: "-",
        state: stateZipMatch[1],
        city: "-",
        zip: stateZipMatch[2],
        cityStateZip: `${stateZipMatch[1]} ${stateZipMatch[2]}`,
        country: "-"
      };
    }
    
    return {
      street: single,
      state: "-",
      city: "-",
      zip: "-",
      cityStateZip: "-",
      country: "-"
    };
  }
  
  return {
    street: address,
    state: "-",
    city: "-",
    zip: "-",
    cityStateZip: "-",
    country: "-"
  };
}

// 保存兑换记录到数据库
function saveToDatabase(cdk, item) {
  const addressInfo = parseAddressInfo(item.address);
  
  saveRedeemHistory({
    cdk: cdk,
    orderNo: item.orderNo,
    categoryName: item.categoryName,
    cardNumber: item.fullCardNumber,
    expiry: item.fullExpiry,
    cvv: item.cvv,
    phone: item.fullPhone,
    holderName: item.holderName,
    address: item.address,
    streetAddress: addressInfo.street,
    cityStateZip: item.cityStateZip || addressInfo.cityStateZip,
    state: item.state || item.stateAbbrev || addressInfo.state,
    country: addressInfo.country,
    verificationUrl: item.verificationUrl,
    instruction: item.instruction,
    isFirstAssignment: item.isFirstAssignment,
    activatedAt: item.activatedAt,
    expiresAt: item.expiresAt,
    redeemedAt: new Date().toISOString()
  });
}

function transformRealPayload(realData) {
  // 优先使用deliveryContent解析
  if (realData.deliveryContent) {
    const parsed = parseDeliveryContent(realData.deliveryContent);
    const addressInfo = parseAddressInfo(parsed.address);
    
    return {
      orderNo: realData.orderNo || realData.order_number || "-",
      categoryName: realData.categoryName || "虚拟卡",
      cardNumber: parsed.cardNumber || "**** **** **** ****",
      fullCardNumber: parsed.cardNumber || parsed.fullCardNumber || "-",
      expiry: parsed.expiry || "--/--",
      fullExpiry: parsed.fullExpiry || parsed.expiry || "--/--",
      cvv: parsed.cvv || "Hidden",
      phone: parsed.phone || "*******",
      fullPhone: parsed.phone || parsed.fullPhone || "-",
      holderName: parsed.holderName || "-",
      address: parsed.address || "-",
      streetAddress: addressInfo.street,
      cityStateZip: addressInfo.cityStateZip,
      country: addressInfo.country,
      verificationUrl: parsed.verificationUrl || "",
      instruction: realData.instruction || parsed.instruction || "请按照说明使用",
      activatedAt: realData.activatedAt || new Date().toISOString(),
      expiresAt: realData.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      isFirstAssignment: realData.isFirstAssignment !== undefined ? realData.isFirstAssignment : true,
    };
  }
  
  // 如果没有deliveryContent，使用直接字段
  return {
    orderNo: realData.orderNo || realData.order_number || "-",
    categoryName: realData.categoryName || realData.category || "虚拟卡",
    cardNumber: realData.cardNumber || realData.maskedCardNumber || "**** **** **** ****",
    fullCardNumber: realData.cardNumber || realData.full_card_number || "-",
    expiry: realData.expiry || realData.expiry_date || "--/--",
    fullExpiry: realData.fullExpiry || realData.expiry || "--/--",
    cvv: realData.cvv || "Hidden",
    phone: realData.phone || realData.maskedPhone || "*******",
    fullPhone: realData.phone || realData.full_phone || "-",
    holderName: realData.holderName || realData.holder_name || "-",
    address: realData.address || "-",
    streetAddress: "-",
    cityStateZip: "-",
    country: "-",
    verificationUrl: "",
    instruction: realData.instruction || realData.usage_instruction || "请按照说明使用",
    activatedAt: realData.activatedAt || realData.activated_at || new Date().toISOString(),
    expiresAt: realData.expiresAt || realData.expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    isFirstAssignment: realData.isFirstAssignment !== undefined ? realData.isFirstAssignment : true,
  };
}

// Notion相关函数已删除

function sanitizePayload(payload) {
  const parsedDelivery = parseDeliveryContent(payload.deliveryContent);

  return {
    orderNo: textOrDash(payload.orderNo),
    categoryName: textOrDash(payload.categoryName),
    cardNumber: maskCardNumber(payload.cardNumber || parsedDelivery.cardNumber),
    fullCardNumber: payload.fullCardNumber || parsedDelivery.fullCardNumber,
    expiry: formatCardExpiry(payload.expiry || parsedDelivery.expiry),
    fullExpiry: payload.fullExpiry || parsedDelivery.fullExpiry,
    phone: maskPhone(payload.phone || parsedDelivery.phone),
    fullPhone: payload.fullPhone || parsedDelivery.fullPhone,
    holderName: textOrDash(payload.holderName || parsedDelivery.holderName),
    address: textOrDash(payload.address || parsedDelivery.address),
    cvv: payload.cvv || parsedDelivery.cvv,
    verificationUrl: payload.verificationUrl || parsedDelivery.verificationUrl,
    activatedAt: textOrDash(payload.activatedAt),
    expiresAt: textOrDash(payload.expiresAt),
    instruction: textOrDash(payload.instruction),
    isFirstAssignment: toBoolean(payload.isFirstAssignment),
  };
}

function parseDeliveryContent(input) {
  const parts = String(input || "")
    .split("----")
    .map((item) => item.trim());

  // 清理URL中的反引号
  const cleanUrl = (url) => url.replace(/`/g, '').trim();

  return {
    cardNumber: parts[0] || "",
    fullCardNumber: parts[0] || "",
    expiry: parts[1] || "",
    fullExpiry: parts[1] || "",
    cvv: parts[2] || "", // CVV通常是第三个部分
    phone: parts[3] || "",
    fullPhone: parts[3] || "",
    verificationUrl: cleanUrl(parts[4] || ""), // 验证码获取URL
    holderName: parts[5] || "",
    address: parts[6] || "",
    instruction: parts[4] || "", // 手机号提示instruction
  };
}

function formatCardExpiry(input) {
  const value = String(input || "").trim();

  if (!value) {
    return "--/--";
  }

  const [year, month] = value.split("/");
  if (!year || !month) {
    return value;
  }

  return `${year}/${month.padStart(2, "0")}`;
}

function maskCardNumber(input) {
  const original = String(input || "").trim();
  const raw = original.replace(/\s+/g, "");
  const digitsOnly = raw.replace(/\D/g, "");

  if (!raw) {
    return "Unavailable";
  }

  if (original.includes("*")) {
    return original;
  }

  if (digitsOnly.length < 8) {
    return "Unavailable";
  }

  return `${digitsOnly.slice(0, 4)} **** **** ${digitsOnly.slice(-4)}`;
}

function maskPhone(input) {
  const raw = String(input || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!raw) {
    return "-";
  }

  if (raw.includes("*")) {
    return raw;
  }

  if (digits.length < 6) {
    return raw;
  }

  return `+${digits.slice(0, 2)}******${digits.slice(-4)}`;
}

function getPropertySchema(schema, propertyName) {
  return schema?.[propertyName] || null;
}

function getPropertyValue(properties, propertyName) {
  const property = properties?.[propertyName];
  if (!property) {
    return "";
  }

  switch (property.type) {
    case "title":
      return joinPlainText(property.title);
    case "rich_text":
      return joinPlainText(property.rich_text);
    case "number":
      return property.number == null ? "" : String(property.number);
    case "checkbox":
      return Boolean(property.checkbox);
    case "select":
      return property.select?.name || "";
    case "status":
      return property.status?.name || "";
    case "date":
      return property.date?.start || "";
    case "url":
      return property.url || "";
    case "phone_number":
      return property.phone_number || "";
    case "email":
      return property.email || "";
    case "unique_id":
      return property.unique_id?.prefix
        ? `${property.unique_id.prefix}${property.unique_id.number}`
        : String(property.unique_id?.number || "");
    case "formula":
      return readFormulaValue(property.formula);
    default:
      return "";
  }
}

function readFormulaValue(formula) {
  if (!formula) {
    return "";
  }

  switch (formula.type) {
    case "string":
      return formula.string || "";
    case "number":
      return formula.number == null ? "" : String(formula.number);
    case "boolean":
      return Boolean(formula.boolean);
    case "date":
      return formula.date?.start || "";
    default:
      return "";
  }
}

function joinPlainText(parts) {
  return Array.isArray(parts)
    ? parts.map((part) => part.plain_text || "").join("")
    : "";
}

async function notionRequest(resourcePath, options = {}) {
  if (!notionConfig.apiKey) {
    throw createHttpError(500, "缺少 NOTION_API_KEY。");
  }

  const response = await fetch(`https://api.notion.com${resourcePath}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${notionConfig.apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw createHttpError(
      response.status,
      payload?.message || "Notion 请求失败。",
    );
  }

  return payload;
}

async function serveStaticFile(requestPath, response, method = "GET") {
  const normalizedPath =
    requestPath === "/" ? "index.html" : path.normalize(requestPath).replace(/^\/+/, "");
  const resolvedPath = path.resolve(__dirname, normalizedPath);

  if (!resolvedPath.startsWith(__dirname) || !existsSync(resolvedPath)) {
    return sendJson(response, 404, { message: "Not found." });
  }

  const file = await readFile(resolvedPath);
  response.writeHead(200, {
    "Content-Type": getContentType(resolvedPath),
  });
  response.end(method === "HEAD" ? undefined : file);
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createHttpError(400, "请求体不是有效的 JSON。", true);
  }
}

function buildTextObject(content) {
  return {
    type: "text",
    text: {
      content,
    },
  };
}

// 从地址中提取邮编
function extractZipcode(cityStateZip) {
  if (!cityStateZip) return null;
  
  // 匹配美国邮编格式 (5位数字或5位-4位格式)
  const zipMatch = cityStateZip.match(/\b(\d{5})(?:-\d{4})?\b/);
  return zipMatch ? zipMatch[1] : null;
}

// 根据邮编获取州和城市信息
async function fetchZipcodeInfo(zipcode) {
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zipcode}`);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.places && data.places.length > 0) {
      const place = data.places[0];
      return {
        city: place["place name"],
        state: place.state,
        stateAbbrev: place["state abbreviation"]
      };
    }
    
    return null;
  } catch (error) {
    console.error("查询邮编失败:", error);
    return null;
  }
}

function textOrDash(input) {
  const value = String(input || "").trim();
  return value || "-";
}

function normalizeId(input) {
  return String(input || "").trim().replace(/-/g, "");
}

function createHttpError(statusCode, message, expose = false) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = expose;
  return error;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return;
    }
  } catch (error) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = stripQuotes(value);
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return defaultValue;
  }

  return toBoolean(normalized);
}

function readIntegerEnv(value, defaultValue, min = Number.NEGATIVE_INFINITY) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  return Math.max(min, parsed);
}

function parseServiceOrigins(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }

  const origins = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return origins.length ? origins : [];
}

function formatFetchError(error) {
  const parts = [];
  const baseMessage = error?.message ? String(error.message).trim() : "";
  const causeCode = error?.cause?.code ? String(error.cause.code).trim() : "";
  const causeMessage = error?.cause?.message ? String(error.cause.message).trim() : "";

  if (baseMessage) {
    parts.push(baseMessage);
  }
  if (causeCode && !parts.includes(causeCode)) {
    parts.push(causeCode);
  }
  if (causeMessage && !parts.includes(causeMessage)) {
    parts.push(causeMessage);
  }

  return parts.length ? parts.join(" | ") : "fetch failed";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toBoolean(input) {
  if (typeof input === "boolean") {
    return input;
  }

  if (typeof input === "string") {
    return input.toLowerCase() === "true";
  }

  return Boolean(input);
}

// 生成支付链接的核心功能
import got from 'got';

async function generatePaymentLink(token, plus) {
  const randomId = generateRandomString(8);
  const proxyUrl = `http://1256090-2d2fc6e1:bef5bf0f-JP-${randomId}-120m@gate.kookeey.info:1000`;
  console.log(`使用代理IP: ${proxyUrl}`);
  
  try {
    // 构建请求数据
    const data = {
      entry_point: plus ? "all_plans_pricing_modal" : "team_workspace_purchase_modal",
      plan_name: plus ? "chatgptplusplan" : "chatgptteamplan",
      billing_details: {
        country: "DE",
        currency: "EUR"
      },
      promo_campaign: {
        promo_campaign_id: plus ? "plus-1-month-free" : "team-1-month-free",
        is_coupon_from_query_param: true
      },
      checkout_ui_mode: plus ? "hosted" : "custom"
    };
    
    if (!plus) {
      data.cancel_url = "https://chatgpt.com/?promo_campaign=team-1-month-free#pricing";
      data.team_plan_data = {
        workspace_name: "Team-" + generateRandomString(8),
        price_interval: "month",
        seat_quantity: 5
      };
    }
    
    // 先访问主页获取 cookies
    await got.get('https://chatgpt.com', {
      proxy: proxyUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      }
    });
    
    // 发送第一个请求
    const firstResponse = await got.post('https://chatgpt.com/backend-api/payments/checkout', {
      json: data,
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "application/json"
      },
      proxy: proxyUrl
    });
    
    const statusCode = firstResponse.statusCode;
    const content = firstResponse.body;
    
    console.log(`Status Code: ${statusCode}`);
    console.log("Response Content:", content);
    
    if (statusCode >= 400) {
      let responseData;
      try {
        responseData = JSON.parse(content);
      } catch (e) {
        responseData = { raw: content };
      }
      
      const message = responseData.message || responseData.error || `上游接口返回失败 (${statusCode})`;
      return {
        status: "error",
        message: message,
        upstream_status: statusCode,
        checkout_response: responseData
      };
    }
    
    // 解析响应并提取 checkout_session_id 和 publishable_key
    const responseData = JSON.parse(content);
    const checkoutSessionId = responseData.checkout_session_id;
    const publishableKey = responseData.publishable_key;
    const shortPayurl = responseData.url;
    
    console.log("\n提取的信息:");
    console.log(`checkout_session_id: ${checkoutSessionId}`);
    console.log(`payurl: ${shortPayurl}`);
    console.log(`publishable_key: ${publishableKey}`);
    
    if (!checkoutSessionId || !publishableKey) {
      return {
        status: "error",
        message: "上游返回缺少 checkout_session_id 或 publishable_key",
        upstream_status: statusCode,
        checkout_response: responseData
      };
    }
    
    // 构建 Stripe API 请求
    console.log("\n发送Stripe API请求...");
    const stripeUrl = `https://api.stripe.com/v1/payment_pages/${checkoutSessionId}/init`;
    
    const stripePayload = `browser_locale=zh-CN&browser_timezone=Asia%2FShanghai&elements_session_client[client_betas][0]=custom_checkout_server_updates_1&elements_session_client[client_betas][1]=custom_checkout_manual_approval_1&elements_session_client[elements_init_source]=custom_checkout&elements_session_client[referrer_host]=chatgpt.com&elements_session_client[stripe_js_id]=${generateUUID()}&elements_session_client[locale]=zh-CN&elements_session_client[is_aggregation_expected]=false&elements_options_client[stripe_js_locale]=auto&elements_options_client[saved_payment_method][enable_save]=never&elements_options_client[saved_payment_method][enable_redisplay]=never&key=${publishableKey}&_stripe_version=2025-03-31.basil%3B+checkout_server_update_beta%3Dv1%3B+checkout_manual_approval_preview%3Dv1`;
    
    // 发送 Stripe API 请求
    const stripeResponse = await got.post(stripeUrl, {
      body: stripePayload,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36"
      },
      proxy: proxyUrl
    });
    
    console.log(`请求状态: ${stripeResponse.statusCode}`);
    const stripeBody = stripeResponse.body;
    console.log("Stripe Response Content:", stripeBody);
    
    let stripeData;
    try {
      stripeData = JSON.parse(stripeBody);
    } catch (e) {
      return {
        status: "error",
        message: `解析 Stripe JSON 失败: ${e}`,
        upstream_status: stripeResponse.statusCode,
        checkout_response: responseData,
        stripe_response: { raw: stripeBody }
      };
    }
    
    if (stripeResponse.statusCode >= 400) {
      const message = stripeData.error?.message || stripeData.message || `Stripe 初始化失败 (${stripeResponse.statusCode})`;
      return {
        status: "error",
        message: message,
        upstream_status: stripeResponse.statusCode,
        checkout_response: responseData,
        stripe_response: stripeData
      };
    }
    
    const payurl = stripeData.stripe_hosted_url;
    console.log(`支付链接: ${payurl}`);
    
    if (!payurl) {
      return {
        status: "error",
        message: "Stripe 返回中未找到支付链接",
        upstream_status: stripeResponse.statusCode,
        checkout_response: responseData,
        stripe_response: stripeData
      };
    }
    
    // 返回结果
    return {
      status: "success",
      Stripe_payurl: payurl,
      openai_payurl: shortPayurl,
      chatgpt_payurl: "https://chatgpt.com/checkout/openai_llc/" + checkoutSessionId
    };
    
  } catch (error) {
    console.error(`请求失败: ${error}`);
    return {
      status: "error",
      message: `请求失败: ${error.message}`
    };
  }
}

// 生成随机字符串
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成 UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function proxyPaymentLinkRequest(token, plus) {
  let lastConnectionError = null;

  for (let attempt = 1; attempt <= PAYMENT_SERVICE_FETCH_RETRIES; attempt += 1) {
    for (const origin of PAYMENT_SERVICE_ORIGINS) {
      const paymentServiceUrl = new URL("/api/request", origin).toString();

      try {
        const upstreamResponse = await fetch(paymentServiceUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ token, plus }),
        });

        const rawBody = await upstreamResponse.text();
        let payload;

        try {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } catch (error) {
          throw new Error(`Python 支付服务返回了无法解析的响应 (${upstreamResponse.status})`);
        }

        return {
          statusCode: upstreamResponse.status,
          payload,
        };
      } catch (error) {
        lastConnectionError = { origin, error };
        console.warn(
          `[payment-service] attempt ${attempt}/${PAYMENT_SERVICE_FETCH_RETRIES} failed for ${origin}: ${formatFetchError(error)}`,
        );
      }
    }

    if (attempt < PAYMENT_SERVICE_FETCH_RETRIES && PAYMENT_SERVICE_RETRY_DELAY_MS > 0) {
      await delay(PAYMENT_SERVICE_RETRY_DELAY_MS);
    }
  }

  const attemptedOrigins = PAYMENT_SERVICE_ORIGINS.join(", ");
  const lastDetail = lastConnectionError
    ? `${lastConnectionError.origin} (${formatFetchError(lastConnectionError.error)})`
    : "未知错误";
  throw new Error(`无法连接到 Python 支付服务。已尝试: ${attemptedOrigins}。最后错误: ${lastDetail}`);
}
