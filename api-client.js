import { createRequire } from 'module';
const require = createRequire(import.meta.url);

class ApiClient {
  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://127.0.0.1';
    this.apiKey = process.env.API_KEY || '';
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
    };

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, mergedOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API request failed:', error.message);
      throw error;
    }
  }

  // 老版卡密兑换接口
  async verifyLegacyExchange(key) {
    return this.request('/api/exchange/verify', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
  }

  // 新版兑换接口（支持邀请码）
  async submitRedeem(redeemCode, inviterCode = '', deviceId = '') {
    return this.request('/open-api/web-api/redeem/submit', {
      method: 'POST',
      body: JSON.stringify({
        redeemCode,
        inviterCode,
        deviceId: deviceId || this.generateDeviceId(),
      }),
    });
  }

  generateDeviceId() {
    return `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // 检查是否为演示CDK
  isDemoCDK(cdk) {
    const demoCDKs = ['123', 'DEMO-001', 'DEMO-002', 'DEMO-003'];
    return demoCDKs.includes(cdk);
  }
}

export default ApiClient;