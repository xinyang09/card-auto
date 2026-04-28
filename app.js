const redeemForm = document.getElementById("redeemForm");
const cdkInput = document.getElementById("cdkInput");
const redeemButton = document.getElementById("redeemButton");
const resultMessage = document.getElementById("resultMessage");
const modeBadge = document.getElementById("modeBadge");
const resultState = document.getElementById("resultState");
const setupHint = document.getElementById("setupHint");
const localHistoryList = document.getElementById("localHistoryList");
const tutorialLink = document.getElementById("tutorialLink");
const buyCardLink = document.getElementById("buyCardLink");
const DEFAULT_INSTRUCTION_TEXT = "此手机号仅用于接收 3DS 与消费验证码，无法用于注册任何项目。";
const CURRENT_CARD_KEY = "card_current_card";

[tutorialLink, buyCardLink].forEach((link) => {
  if (!link) {
    return;
  }

  link.addEventListener("click", (event) => {
    if (link.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
    }
  });
});

// localStorage 历史记录管理
const HISTORY_KEY = "card_redeem_history";

function getLocalHistory() {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    localStorage.removeItem(HISTORY_KEY);
    return [];
  }
}

function saveToLocalHistory(item) {
  const history = getLocalHistory();
  
  // 检查是否已存在相同CDK的记录
  const existingIndex = history.findIndex(h => h.cdk === item.cdk);
  if (existingIndex >= 0) {
    history[existingIndex] = item;
  } else {
    history.unshift(item);
  }
  
  // 最多保存100条记录
  if (history.length > 100) {
    history.pop();
  }
  
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderLocalHistoryList();
}

function getCurrentCardState() {
  try {
    const data = localStorage.getItem(CURRENT_CARD_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    localStorage.removeItem(CURRENT_CARD_KEY);
    return null;
  }
}

function saveCurrentCardState(state) {
  localStorage.setItem(CURRENT_CARD_KEY, JSON.stringify(state));
}

function clearCurrentCardState() {
  localStorage.removeItem(CURRENT_CARD_KEY);
}

function renderLocalHistoryList() {
  if (!localHistoryList) {
    return;
  }

  const history = getLocalHistory();
  localHistoryList.replaceChildren();

  if (!history.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "rounded-xl border border-neutral-300 bg-white px-4 py-3 text-xs text-neutral-500";
    emptyState.textContent = "暂无兑换历史";
    localHistoryList.appendChild(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();

  history.forEach((item) => {
    const details = document.createElement("details");
    details.className = "rounded-xl border border-neutral-300 bg-white";

    const summary = document.createElement("summary");
    summary.className = "list-none cursor-pointer px-4 py-3";

    const summaryText = document.createElement("div");
    summaryText.className = "truncate text-xs text-neutral-700";
    summaryText.textContent = formatHistorySummary(item);
    summary.appendChild(summaryText);

    const content = document.createElement("pre");
    content.className = "overflow-x-auto border-t border-neutral-200 px-4 py-3 text-xs leading-relaxed text-neutral-700";
    content.textContent = JSON.stringify(item, null, 2);

    details.appendChild(summary);
    details.appendChild(content);
    fragment.appendChild(details);
  });

  localHistoryList.appendChild(fragment);
}

function formatHistorySummary(item) {
  const cdk = safeText(item.cdk || "-");
  const category = safeText(item.category_name || "-");
  const orderNo = safeText(item.order_no || "-");
  const cardTail = getCardTail(item.card_number);
  const redeemedAt = formatHistoryTime(item.redeemed_at);

  return `CDK ${cdk} · 分类 ${category} · 尾号 ${cardTail} · 订单 ${orderNo} · ${redeemedAt}`;
}

function getCardTail(cardNumber) {
  const digits = String(cardNumber || "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : "----";
}

function formatHistoryTime(input) {
  if (!input) {
    return "-";
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return String(input);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const fields = {
  categoryName: document.getElementById("categoryName"),
  firstAssignment: document.getElementById("firstAssignment"),
  cardNumber: document.getElementById("cardNumber"),
  cardExpiry: document.getElementById("cardExpiry"),
  cardCvv: document.getElementById("cardCvv"),
  orderNo: document.getElementById("orderNo"),
  phoneNumber: document.getElementById("phoneNumber"),
  holderName: document.getElementById("holderName"),
  holderAddress: document.getElementById("holderAddress"),
  fullAddress: document.getElementById("fullAddress"),
  streetAddress: document.getElementById("streetAddress"),
  cityStateZip: document.getElementById("cityStateZip"),
  state: document.getElementById("state"),
  country: document.getElementById("country"),
  activatedAt: document.getElementById("activatedAt"),
  expiresAt: document.getElementById("expiresAt"),
  instructionText: document.getElementById("instructionText"),
  verificationCode: document.getElementById("verificationCode"),
};

let currentVerificationUrl = null;

const refreshCodeBtn = document.getElementById("refreshCode");

// 刷新验证码按钮事件监听器
if (refreshCodeBtn) {
  refreshCodeBtn.addEventListener("click", async () => {
    if (!currentVerificationUrl) {
      return;
    }

    refreshCodeBtn.disabled = true;
    refreshCodeBtn.textContent = "获取中...";

    try {
      const response = await fetch(currentVerificationUrl);
      const text = await response.text();
      
      // 解析响应格式: "code|验证码" 或 "no|暂无验证码"
      const parts = text.split("|");
      if (parts[0] === "code" && parts[1]) {
        if (fields.verificationCode) {
          fields.verificationCode.textContent = parts[1];
          fields.verificationCode.classList.remove("no-code");
        }
      } else {
        if (fields.verificationCode) {
          fields.verificationCode.textContent = "暂无验证码";
          fields.verificationCode.classList.add("no-code");
        }
      }
    } catch (error) {
      if (fields.verificationCode) {
        fields.verificationCode.textContent = "暂无验证码";
        fields.verificationCode.classList.add("no-code");
      }
    } finally {
      refreshCodeBtn.disabled = false;
      refreshCodeBtn.textContent = "刷新";
    }
  });
}

const countdownTimer = document.getElementById("countdownTimer");
let countdownInterval = null;

// showCompleteInfoBtn事件监听器已删除（按钮已隐藏）
/*
const showCompleteInfoBtn = document.getElementById("showCompleteInfo");

showCompleteInfoBtn.addEventListener("click", async () => {
  setLoading(true);
  setMessage("正在获取完整卡片信息...");
  setState("Loading");

  try {
    const response = await fetch("/api/complete-info");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.message || "获取完整信息失败");
    }

    displayCompleteInfo(payload.completeInfo);
    setMessage(payload.message || "完整卡片信息已显示", "success");
    setState("Complete Info");
  } catch (error) {
    setMessage(error.message || "获取完整信息失败", "error");
    setState("Failed");
  } finally {
    setLoading(false);
  }
});
*/

redeemForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const cdk = cdkInput.value.trim();
  if (!cdk) {
    return;
  }

  setLoading(true);

  try {
    const response = await fetch("/api/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cdk }),
    });

    const payload = await response.json();

    // 检查是否成功
    if (!response.ok || (payload.item && payload.mode === "error")) {
      throw new Error(payload?.message || "兑换失败，请稍后重试。");
    }

    const redeemedAt = new Date().toISOString();
    const countdownEndsAt = buildCountdownEndsAt(payload.item.activatedAt, redeemedAt);

    renderPayload(payload.item);
    saveCurrentCardState({
      cdk,
      item: payload.item,
      countdownEndsAt,
      savedAt: redeemedAt,
    });
    
    // 保存到本地历史记录
    saveToLocalHistory({
      cdk: cdk,
      category_name: payload.item.categoryName,
      card_number: payload.item.fullCardNumber || payload.item.cardNumber,
      order_no: payload.item.orderNo,
      expiry: payload.item.fullExpiry,
      cvv: payload.item.cvv,
      phone: payload.item.fullPhone,
      holder_name: payload.item.holderName,
      address: payload.item.address,
      street_address: payload.item.streetAddress,
      city_state_zip: payload.item.cityStateZip,
      state: payload.item.state || '-',
      country: payload.item.country,
      verification_url: payload.item.verificationUrl,
      instruction: payload.item.instruction,
      is_first_assignment: payload.item.isFirstAssignment,
      activated_at: payload.item.activatedAt,
      expires_at: payload.item.expiresAt,
      redeemed_at: redeemedAt
    });
    
    // 根据激活时间启动1小时倒计时
    startCountdown(countdownEndsAt);
  } catch (error) {
    clearPreview({ clearStoredCard: true });
  } finally {
    setLoading(false);
  }
});

bootstrap();
renderLocalHistoryList();

if (!restoreCurrentCardState()) {
  clearPreview();
}

async function bootstrap() {
  try {
    const response = await fetch("/api/status");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.message || "状态初始化失败。");
    }

    if (modeBadge) {
      modeBadge.textContent = payload.mode === "demo" ? "Demo Mode" : "Notion Mode";
    }
    if (setupHint) {
      setupHint.textContent = payload.hint;
    }

    applyExternalLink(tutorialLink, payload.tutorialUrl);
    applyExternalLink(buyCardLink, payload.buyCardUrl);
  } catch (error) {
    if (modeBadge) {
      modeBadge.textContent = "Status Error";
    }
    setState("Offline");
    applyExternalLink(tutorialLink, "");
    applyExternalLink(buyCardLink, "");
  }
}

function applyExternalLink(element, url) {
  if (!element) {
    return;
  }

  const hasUrl = typeof url === "string" && /^https?:\/\//i.test(url.trim());
  if (hasUrl) {
    element.href = url.trim();
    element.setAttribute("aria-disabled", "false");
    element.removeAttribute("tabindex");
    element.classList.remove("is-disabled");
    return;
  }

  element.href = "#";
  element.setAttribute("aria-disabled", "true");
  element.setAttribute("tabindex", "-1");
  element.classList.add("is-disabled");
}

function renderPayload(item) {
  if (fields.categoryName) fields.categoryName.textContent = safeText(item.categoryName);
  if (fields.firstAssignment) fields.firstAssignment.textContent = formatAssignment(item.isFirstAssignment);
  
  // 显示完整信息而不是脱敏信息，格式化卡号每4位用空格隔开
  if (fields.cardNumber) fields.cardNumber.textContent = formatCardNumber(item.fullCardNumber || item.cardNumber);
  
  // 检查是否过期
  if (item.isExpired) {
    if (fields.cardExpiry) {
      fields.cardExpiry.textContent = "已过期";
      fields.cardExpiry.className = "text-sm font-semibold text-red-600";
    }
    if (fields.expiresAt) {
      fields.expiresAt.textContent = "已过期";
      fields.expiresAt.className = "text-sm font-medium text-red-600";
    }
  } else {
    if (fields.cardExpiry) {
      fields.cardExpiry.textContent = formatCardExpiry(item.fullExpiry || item.expiry);
      fields.cardExpiry.className = "text-sm font-semibold";
    }
    if (fields.expiresAt) {
      fields.expiresAt.textContent = formatDate(item.expiresAt);
      fields.expiresAt.className = "text-sm font-medium";
    }
  }
  
  if (fields.cardCvv) fields.cardCvv.textContent = safeText(item.cvv || "Hidden");
  
  if (fields.orderNo) fields.orderNo.textContent = safeText(item.orderNo);
  if (fields.phoneNumber) fields.phoneNumber.textContent = safeText(item.fullPhone || item.phone);
  if (fields.holderName) fields.holderName.textContent = safeText(item.holderName);
  if (fields.holderAddress) fields.holderAddress.textContent = safeText(item.address);
  if (fields.fullAddress) fields.fullAddress.textContent = safeText(item.address);
  
  // 解析地址信息
  const addressInfo = parseAddress(item.address);
  if (fields.streetAddress) fields.streetAddress.textContent = addressInfo.street;
  if (fields.cityStateZip) fields.cityStateZip.textContent = item.cityStateZip || addressInfo.cityStateZip;
  if (fields.state) fields.state.textContent = item.state || addressInfo.state || '-';
  if (fields.country) fields.country.textContent = addressInfo.country;
  
  // 保存验证码URL并自动获取验证码
  if (item.verificationUrl) {
    currentVerificationUrl = item.verificationUrl;
    // 自动获取验证码
    fetchVerificationCode();
  } else {
    currentVerificationUrl = null;
    if (fields.verificationCode) {
      fields.verificationCode.textContent = "暂无验证码";
      fields.verificationCode.className = "text-sm font-mono font-bold text-stone-400";
    }
  }
  
  if (fields.activatedAt) fields.activatedAt.textContent = formatDate(item.activatedAt);
  if (fields.instructionText) fields.instructionText.textContent = safeText(item.instruction);
}

// 获取验证码
async function fetchVerificationCode() {
  if (!currentVerificationUrl) {
    return;
  }
  
  if (fields.verificationCode) {
    fields.verificationCode.textContent = "获取中...";
  }
  
  try {
    // 通过服务器代理获取验证码（解决跨域问题）
    const response = await fetch(`/api/verification?url=${encodeURIComponent(currentVerificationUrl)}`);
    const result = await response.json();
    
    if (result.success && result.data) {
      // 解析响应格式: "code|验证码" 或 "no|暂无验证码"
      const parts = result.data.split("|");
      if (parts[0] === "code" && parts[1]) {
        if (fields.verificationCode) {
          fields.verificationCode.textContent = parts[1];
          fields.verificationCode.className = "text-sm font-mono font-bold text-emerald-600";
        }
      } else {
        if (fields.verificationCode) {
          fields.verificationCode.textContent = "暂无验证码";
          fields.verificationCode.className = "text-sm font-mono font-bold text-stone-400";
        }
      }
    } else {
      if (fields.verificationCode) {
        fields.verificationCode.textContent = "暂无验证码";
        fields.verificationCode.className = "text-sm font-mono font-bold text-stone-400";
      }
    }
  } catch (error) {
    if (fields.verificationCode) {
      fields.verificationCode.textContent = "暂无验证码";
      fields.verificationCode.className = "text-sm font-mono font-bold text-stone-400";
    }
  }
}

// 解析地址信息
function parseAddress(address) {
  if (!address) {
    return {
      street: "-",
      city: "-",
      state: "-",
      zip: "-",
      cityStateZip: "-",
      country: "-"
    };
  }
  
  // 常见地址格式: "街道, 城市 邮编, 国家" 或 "街道, 城市 州 邮编, 国家"
  // 例如: "2555 Howerton Court, Charlotte 28270, US"
  // 或: "12801 COPPER AVE NE D34, ALBUQUERQUE NM 87123, US"
  
  const parts = address.split(",").map(p => p.trim());
  
  if (parts.length >= 3) {
    // 格式: "街道, 城市/州 邮编, 国家"
    const middle = parts.slice(1, -1).join(", ");
    
    // 尝试提取州和邮编
    let state = "-";
    let zip = "-";
    let city = middle;
    
    // 匹配州缩写 + 邮编
    const stateZipMatch = middle.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2];
      city = middle.replace(stateZipMatch[0], '').trim();
    }
    
    return {
      street: parts[0] || "-",
      city: city || "-",
      state: state,
      zip: zip,
      cityStateZip: state !== "-" ? `${city} ${state} ${zip}` : (city !== "-" ? city : "-"),
      country: parts[parts.length - 1] || "-"
    };
  } else if (parts.length === 2) {
    // 格式: "街道, 城市/州邮编 国家"
    const middle = parts[1];
    
    // 尝试提取州和邮编
    let state = "-";
    let zip = "-";
    let city = middle;
    
    // 匹配州缩写 + 邮编
    const stateZipMatch = middle.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2];
      city = middle.replace(stateZipMatch[0], '').trim();
    }
    
    return {
      street: parts[0] || "-",
      city: city || "-",
      state: state,
      zip: zip,
      cityStateZip: state !== "-" ? `${city} ${state} ${zip}` : (city !== "-" ? city : "-"),
      country: "-"
    };
  } else {
    // 只有一个部分
    return {
      street: address,
      city: "-",
      state: "-",
      zip: "-",
      cityStateZip: "-",
      country: "-"
    };
  }
}

function restoreCurrentCardState() {
  const currentCardState = getCurrentCardState();
  if (!currentCardState?.item) {
    return false;
  }

  renderPayload(currentCardState.item);
  if (cdkInput && currentCardState.cdk) {
    cdkInput.value = currentCardState.cdk;
  }

  const countdownEndsAt = resolveCurrentCardCountdownEndAt(currentCardState);
  if (countdownEndsAt) {
    if (currentCardState.countdownEndsAt !== countdownEndsAt) {
      saveCurrentCardState({
        ...currentCardState,
        countdownEndsAt,
      });
    }
    startCountdown(countdownEndsAt);
  } else {
    stopCountdown();
  }

  setState("已恢复");
  return true;
}

function clearPreview(options = {}) {
  const { clearStoredCard = false } = options;
  renderPayload({
    categoryName: "-",
    isFirstAssignment: null,
    cardNumber: "----",
    fullCardNumber: "----",
    expiry: "--/--",
    fullExpiry: "--/--",
    cvv: "-",
    orderNo: "-",
    phone: "-",
    fullPhone: "-",
    holderName: "-",
    address: "-",
    verificationUrl: null,
    activatedAt: "-",
    expiresAt: "-",
    instruction: DEFAULT_INSTRUCTION_TEXT,
  });
  if (clearStoredCard) {
    clearCurrentCardState();
  }
  if (cdkInput) {
    cdkInput.value = "";
  }
  stopCountdown();
  setState("等待兑换");
}

// 格式化卡号，每4位用空格隔开
function formatCardNumber(input) {
  const value = String(input || "").trim();
  if (!value || value === "-") {
    return "----";
  }
  
  // 移除所有非数字字符
  const digitsOnly = value.replace(/\D/g, '');
  
  if (digitsOnly.length === 0) {
    return "----";
  }
  
  // 每4位添加空格
  const formatted = digitsOnly.match(/.{1,4}/g)?.join(' ') || value;
  
  return formatted;
}

function formatCardExpiry(input) {
  const value = String(input || "").trim();
  if (!value || value === "-") {
    return "--/--";
  }

  // 支持多种格式
  // 格式1: YYYY/MM 或 YYYY-M (例如 "2030/6" 或 "2030-6")
  // 格式2: MM/YY (例如 "06/30")
  // 格式3: YYYY-MM (例如 "2030-06")
  
  const slashMatch = value.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (slashMatch) {
    const year = slashMatch[1];
    const month = slashMatch[2];
    const shortYear = year.slice(-2);
    return `${month.padStart(2, "0")}/${shortYear}`;
  }
  
  const mmSlashYyMatch = value.match(/^(\d{1,2})\/(\d{2})$/);
  if (mmSlashYyMatch) {
    return value;
  }
  
  return value;
}

function formatDate(input) {
  if (!input || input === "-") {
    return "-";
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return String(input);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

// 美国地址生成器
const US_STATES = [
  { name: 'California', abbr: 'CA' },
  { name: 'Texas', abbr: 'TX' },
  { name: 'Florida', abbr: 'FL' },
  { name: 'New York', abbr: 'NY' },
  { name: 'Pennsylvania', abbr: 'PA' },
  { name: 'Illinois', abbr: 'IL' },
  { name: 'Ohio', abbr: 'OH' },
  { name: 'Georgia', abbr: 'GA' },
  { name: 'North Carolina', abbr: 'NC' },
  { name: 'Michigan', abbr: 'MI' },
  { name: 'New Jersey', abbr: 'NJ' },
  { name: 'Virginia', abbr: 'VA' },
  { name: 'Washington', abbr: 'WA' },
  { name: 'Arizona', abbr: 'AZ' },
  { name: 'Massachusetts', abbr: 'MA' },
  { name: 'Tennessee', abbr: 'TN' },
  { name: 'Indiana', abbr: 'IN' },
  { name: 'Missouri', abbr: 'MO' },
  { name: 'Maryland', abbr: 'MD' },
  { name: 'Wisconsin', abbr: 'WI' }
];

const FIRST_NAMES = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const STREETS = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Pine Rd', 'Elm St', 'Washington Blvd', 'Park Ave', 'Lake Dr', 'Hill Rd', 'River Rd', 'Forest Ave', 'Sunset Blvd', 'Valley Rd', 'Church St'];
const CITIES = ['Los Angeles', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte', 'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Washington', 'Boston', 'Nashville'];

function generateRandomAddress() {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const streetNum = Math.floor(Math.random() * 9999) + 1;
  const street = STREETS[Math.floor(Math.random() * STREETS.length)];
  const state = US_STATES[Math.floor(Math.random() * US_STATES.length)];
  const zip = Math.floor(Math.random() * 90000) + 10000;
  
  const fullName = `${firstName} ${lastName}`;
  const streetAddress = `${streetNum} ${street}`;
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  const fullAddress = `${streetAddress}, ${city} ${state.abbr} ${zip}, US`;
  
  document.getElementById('genName').textContent = fullName;
  document.getElementById('genStreet').textContent = streetAddress;
  document.getElementById('genCity').textContent = city;
  document.getElementById('genState').textContent = `${state.name} (${state.abbr})`;
  document.getElementById('genZip').textContent = zip;
  document.getElementById('genFullAddress').textContent = fullAddress;
}

function safeText(input) {
  const text = String(input || "").trim();
  return text || "-";
}

function formatAssignment(input) {
  if (input === true) {
    return "首次分配";
  }

  if (input === false) {
    return "已兑换";
  }

  return "-";
}

function setLoading(isLoading) {
  redeemButton.disabled = isLoading;
  redeemButton.textContent = isLoading ? "兑换中..." : "立即兑换";
}

function setMessage(message, tone = "neutral") {
  if (resultMessage) {
    resultMessage.textContent = message;
    
    // 移除所有状态类
    resultMessage.classList.remove("hidden", "bg-emerald-50", "text-emerald-700", "bg-red-50", "text-red-700", "bg-stone-50", "text-stone-700");
    
    if (tone === "success") {
      resultMessage.classList.add("bg-emerald-50", "text-emerald-700");
      resultMessage.classList.remove("hidden");
    } else if (tone === "error") {
      resultMessage.classList.add("bg-red-50", "text-red-700");
      resultMessage.classList.remove("hidden");
    } else if (tone === "neutral") {
      resultMessage.classList.add("bg-stone-50", "text-stone-700");
      resultMessage.classList.remove("hidden");
    } else {
      resultMessage.classList.add("hidden");
    }
  }
}

function setState(text) {
  if (resultState) {
    resultState.textContent = text;
  }
}

function displayCompleteInfo(completeInfo) {
  if (!completeInfo || completeInfo.length === 0) {
    setMessage("没有可用的完整卡片信息", "neutral");
    return;
  }

  // Create a modal or overlay to display complete information
  const modal = document.createElement("div");
  modal.className = "fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-5";
  modal.innerHTML = `
    <div class="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 relative">
      <div class="flex justify-between items-center mb-5">
        <h3 class="text-lg font-semibold text-stone-800">完整卡片信息</h3>
        <button class="modal-close text-2xl bg-none border-none text-stone-400 cursor-pointer hover:text-stone-600">&times;</button>
      </div>
      <div>
        ${completeInfo.map(item => `
          <div class="border border-stone-200 rounded-lg p-4 mb-4">
            <h4 class="text-emerald-600 font-semibold mb-3">CDK: ${safeText(item.cdk)}</h4>
            <div class="space-y-2 text-sm">
              <p><span class="text-stone-500">订单号:</span> <span class="font-medium">${safeText(item.orderNo)}</span></p>
              <p><span class="text-stone-500">类别:</span> <span class="font-medium">${safeText(item.categoryName)}</span></p>
              <p><span class="text-stone-500">完整卡号:</span> <span class="font-mono font-medium">${safeText(item.fullCardNumber)}</span></p>
              <p><span class="text-stone-500">有效期:</span> <span class="font-medium">${safeText(item.fullExpiry)}</span></p>
              <p><span class="text-stone-500">完整手机号:</span> <span class="font-mono font-medium">${safeText(item.fullPhone)}</span></p>
              <p><span class="text-stone-500">持卡人:</span> <span class="font-medium">${safeText(item.holderName)}</span></p>
              <p><span class="text-stone-500">地址:</span> <span class="font-medium">${safeText(item.address)}</span></p>
              <p><span class="text-stone-500">CVV:</span> <span class="font-mono font-medium">${safeText(item.cvv)}</span></p>
              <p><span class="text-stone-500">激活时间:</span> <span class="font-medium">${formatDate(item.activatedAt)}</span></p>
              <p><span class="text-stone-500">过期时间:</span> <span class="font-medium">${formatDate(item.expiresAt)}</span></p>
              <p><span class="text-stone-500">说明:</span> <span class="font-medium">${safeText(item.instruction)}</span></p>
              <p><span class="text-stone-500">首次分配:</span> <span class="font-medium">${formatAssignment(item.isFirstAssignment)}</span></p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Add close functionality
  modal.querySelector('.modal-close').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Add click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  document.body.appendChild(modal);
}

// 显示历史记录弹窗
// 启动倒计时（基于激活时间的1小时）
function startCountdown(countdownEndsAt) {
  // 清除现有的倒计时
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  let timeLeft;
  
  // 基于固定结束时间计算剩余倒计时
  if (countdownEndsAt) {
    const expiresDate = new Date(countdownEndsAt);
    const now = new Date();
    if (Number.isNaN(expiresDate.getTime())) {
      timeLeft = 60 * 60;
    } else {
      timeLeft = Math.max(0, Math.floor((expiresDate - now) / 1000));
    }
  } else {
    // 默认1小时
    timeLeft = 60 * 60;
  }
  
  // 立即更新一次显示
  updateCountdownDisplay(timeLeft);
  
  // 设置定时器每秒更新一次
  countdownInterval = setInterval(() => {
    timeLeft--;
    
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      if (countdownTimer) {
        countdownTimer.textContent = "已到期";
        countdownTimer.className = "text-xl font-bold font-mono text-red-600 tracking-wider";
      }
      return;
    }
    
    updateCountdownDisplay(timeLeft);
  }, 1000);
}

// 更新倒计时显示
function updateCountdownDisplay(seconds) {
  if (!countdownTimer) {
    return;
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  countdownTimer.textContent = display;
  
  // 当剩余时间少于10分钟时显示警告样式
  if (seconds < 600) {
    countdownTimer.className = "text-xl font-bold font-mono text-red-500 tracking-wider";
  } else {
    countdownTimer.className = "text-xl font-bold font-mono text-emerald-600 tracking-wider";
  }
}

// 停止倒计时
function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (countdownTimer) {
    countdownTimer.textContent = "01:00:00";
    countdownTimer.className = "text-xl font-bold font-mono text-emerald-600 tracking-wider";
  }
}

function buildCountdownEndsAt(activatedAt, fallbackStartedAt = new Date().toISOString()) {
  const baseDate = parseCountdownBaseDate(activatedAt) || parseCountdownBaseDate(fallbackStartedAt);
  if (!baseDate) {
    return null;
  }

  return new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString();
}

function resolveCurrentCardCountdownEndAt(currentCardState) {
  if (currentCardState?.countdownEndsAt) {
    return currentCardState.countdownEndsAt;
  }

  const activatedCountdownEndsAt = buildCountdownEndsAt(currentCardState?.item?.activatedAt);
  if (activatedCountdownEndsAt) {
    return activatedCountdownEndsAt;
  }

  const historyItem = getLocalHistory().find((item) => item.cdk === currentCardState?.cdk);
  if (historyItem?.redeemed_at) {
    return buildCountdownEndsAt(null, historyItem.redeemed_at);
  }

  if (currentCardState?.savedAt) {
    return buildCountdownEndsAt(null, currentCardState.savedAt);
  }

  return null;
}

function parseCountdownBaseDate(input) {
  if (!input || input === "-") {
    return null;
  }

  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}
