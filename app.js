const redeemForm = document.getElementById("redeemForm");
const cdkInput = document.getElementById("cdkInput");
const redeemButton = document.getElementById("redeemButton");
const resultMessage = document.getElementById("resultMessage");
const modeBadge = document.getElementById("modeBadge");
const resultState = document.getElementById("resultState");
const setupHint = document.getElementById("setupHint");

// localStorage 历史记录管理
const HISTORY_KEY = 'card_redeem_history';

function getLocalHistory() {
  const data = localStorage.getItem(HISTORY_KEY);
  return data ? JSON.parse(data) : [];
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
        fields.verificationCode.textContent = "获取失败";
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

    renderPayload(payload.item);
    
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
      redeemed_at: new Date().toISOString()
    });
    
    // 根据激活时间启动1小时倒计时
    startCountdown(payload.item.activatedAt);
  } catch (error) {
    clearPreview();
  } finally {
    setLoading(false);
  }
});

bootstrap();
clearPreview();

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
  } catch (error) {
    if (modeBadge) {
      modeBadge.textContent = "Status Error";
    }
    setState("Offline");
  }
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
        fields.verificationCode.textContent = "获取失败";
        fields.verificationCode.className = "text-sm font-mono font-bold text-red-500";
      }
    }
  } catch (error) {
    if (fields.verificationCode) {
      fields.verificationCode.textContent = "获取失败";
      fields.verificationCode.className = "text-sm font-mono font-bold text-red-500";
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

function clearPreview() {
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
    instruction: "等待有效 CDK。",
  });
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
function showHistoryModal() {
  const history = getLocalHistory();
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
      <div class="flex justify-between items-center p-6 border-b">
        <h3 class="text-xl font-bold text-gray-900">兑换历史</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
      </div>
      <div class="flex-1 overflow-y-auto p-6">
        ${history.length > 0 ? history.map(item => {
          const date = new Date(item.redeemed_at).toLocaleString('zh-CN');
          const isExpired = new Date(item.expires_at) < new Date();
          return `
            <div class="bg-gray-50 rounded-xl p-4 mb-4">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <p class="font-semibold text-gray-900">CDK: ${item.cdk}</p>
                  <p class="text-sm text-gray-500">订单: ${item.order_no}</p>
                  <p class="text-sm text-gray-500">卡号: ${item.card_number}</p>
                </div>
                <div class="text-right">
                  <p class="text-xs text-gray-400">${date}</p>
                  <p class="text-xs font-semibold ${isExpired ? 'text-red-500' : 'text-green-600'}">${isExpired ? '已过期' : '有效'}</p>
                </div>
              </div>
              <button onclick="restoreFromHistory('${item.cdk}')" class="w-full mt-3 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                查看详情
              </button>
            </div>
          `;
        }).join('') : '<p class="text-center text-gray-500 py-12">暂无兑换记录</p>'}
      </div>
    </div>
  `;
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  document.body.appendChild(modal);
}

// 从历史记录恢复
function restoreFromHistory(cdk) {
  const history = getLocalHistory();
  const item = history.find(h => h.cdk === cdk);
  
  if (!item) return;
  
  // 关闭弹窗
  document.querySelector('.fixed.bg-black\\/50')?.remove();
  
  // 填充数据
  if (fields.categoryName) fields.categoryName.textContent = item.category_name || '-';
  if (fields.firstAssignment) fields.firstAssignment.textContent = item.is_first_assignment ? '首次分配' : '非首次';
  if (fields.cardNumber) fields.cardNumber.textContent = item.card_number || '----';
  
  // 格式化有效期
  const expiryVal = item.expiry || '';
  const expParts = expiryVal.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (fields.cardExpiry) {
    if (expParts) {
      fields.cardExpiry.textContent = `${expParts[2].padStart(2,'0')}/${expParts[1].slice(-2)}`;
    } else {
      fields.cardExpiry.textContent = expiryVal;
    }
  }
  
  if (fields.cardCvv) fields.cardCvv.textContent = item.cvv || 'Hidden';
  if (fields.orderNo) fields.orderNo.textContent = item.order_no || '-';
  if (fields.phoneNumber) fields.phoneNumber.textContent = item.phone || '-';
  if (fields.holderName) fields.holderName.textContent = item.holder_name || '-';
  if (fields.holderAddress) fields.holderAddress.textContent = item.address || '-';
  if (fields.fullAddress) fields.fullAddress.textContent = item.address || '-';
  
  // 解析地址
  const addr = item.address || '';
  const addrParts = addr.split(',').map(p => p.trim());
  if (addrParts.length >= 2) {
    if (fields.streetAddress) fields.streetAddress.textContent = addrParts[0];
    if (fields.country) fields.country.textContent = addrParts[addrParts.length - 1];
    if (fields.cityStateZip) fields.cityStateZip.textContent = addrParts.slice(1, -1).join(', ') || '-';
  } else {
    if (fields.streetAddress) fields.streetAddress.textContent = addr || '-';
    if (fields.cityStateZip) fields.cityStateZip.textContent = '-';
    if (fields.country) fields.country.textContent = '-';
  }
  
  // 格式化日期
  const fmtDate = (str) => {
    if (!str) return '-';
    const d = new Date(str);
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
  };
  
  if (fields.activatedAt) fields.activatedAt.textContent = fmtDate(item.activated_at);
  
  const isExpired = new Date(item.expires_at) < new Date();
  if (fields.expiresAt) {
    fields.expiresAt.textContent = isExpired ? '已过期' : fmtDate(item.expires_at);
    fields.expiresAt.className = isExpired ? 'text-sm font-medium text-red-600' : 'text-sm font-medium';
  }
  
  if (fields.instructionText) fields.instructionText.textContent = item.instruction || '-';
  
  // 获取验证码
  currentVerificationUrl = item.verification_url;
  if (currentVerificationUrl) {
    fetchVerificationCode();
  }
  
  // 启动1小时倒计时（基于激活时间）
  startCountdown(item.activated_at);
}

// 启动倒计时（基于激活时间的1小时）
function startCountdown(activatedAt) {
  // 清除现有的倒计时
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  let timeLeft;
  
  // 基于激活时间计算1小时倒计时
  if (activatedAt) {
    const activatedDate = new Date(activatedAt);
    const expiresDate = new Date(activatedDate.getTime() + 60 * 60 * 1000); // 激活后1小时
    const now = new Date();
    timeLeft = Math.max(0, Math.floor((expiresDate - now) / 1000));
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
