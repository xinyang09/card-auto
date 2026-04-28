import tls_client
import json
import random
import string
import uuid
import os
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response

def build_error(message, upstream_status=None, **extra):
    payload = {
        "status": "error",
        "message": message
    }

    if upstream_status is not None:
        payload["upstream_status"] = upstream_status

    for key, value in extra.items():
        if value is not None:
            payload[key] = value

    return payload

def extract_upstream_message(response_data, status_code):
    if not isinstance(response_data, dict):
        return f"上游接口返回失败 ({status_code})"

    error_value = response_data.get("error")
    detail_value = response_data.get("detail")
    message_value = response_data.get("message")

    if isinstance(error_value, dict):
        nested_message = error_value.get("message") or error_value.get("detail")
        if nested_message:
            return nested_message

    if isinstance(message_value, str) and message_value.strip():
        return message_value

    if isinstance(detail_value, str) and detail_value.strip():
        return detail_value

    if isinstance(error_value, str) and error_value.strip():
        return error_value

    return f"上游接口返回失败 ({status_code})"

def process_request(token, plus):
    # 生成随机8位字符
    random_id = ''.join(random.choices(string.ascii_letters + string.digits, k=8))

    # 构建代理URL
    proxy_url = f"http://1256090-2d2fc6e1:bef5bf0f-JP-{random_id}-120m@gate.kookeey.info:1000"
    print(f"使用代理IP: {proxy_url}")

    # 配置请求参数
    url = "https://chatgpt.com/backend-api/payments/checkout"
    # 提交数据
    data = {
        "entry_point": "all_plans_pricing_modal" if plus else "team_workspace_purchase_modal",
        "plan_name": "chatgptplusplan" if plus else "chatgptteamplan",
        "billing_details": {
            "country": "DE",
            "currency": "EUR"
        },
        "promo_campaign": {
            "promo_campaign_id": "plus-1-month-free" if plus else "team-1-month-free",
            "is_coupon_from_query_param": True
        },
        "checkout_ui_mode": "hosted" if plus else "custom"
    }
    
    # 如果plus=false，新增cancel_url和team_plan_data
    if not plus:
        data["cancel_url"] = "https://chatgpt.com/?promo_campaign=team-1-month-free#pricing"
        data["team_plan_data"] = {
            "workspace_name": "Team-" + ''.join(random.choices(string.ascii_letters + string.digits, k=8)),
            "price_interval": "month",
            "seat_quantity": 5
        }



    # 协议头
    headers = {
        "authorization": f"Bearer {token}",
        "content-type": "application/json"
    }
    client = tls_client.Session(
        client_identifier="chrome130",  # 使用Chrome 130的TLS指纹
        random_tls_extension_order=True
    )
    client.cookies_enabled = True
    try:
        client.get(
            "https://chatgpt.com",
            proxy=proxy_url
        )
        response = client.post(
            url=url,
            headers=headers,
            json=data,
            allow_redirects=True,
            proxy=proxy_url
        )
        
        # 获取响应状态码和内容
        status_code = response.status_code
        content = response.text
        
        print(f"Status Code: {status_code}")
        print("Response Content:")
        print(content)

        if status_code >= 400:
            try:
                response_data = json.loads(content)
            except json.JSONDecodeError:
                response_data = {"raw": content}

            message = extract_upstream_message(response_data, status_code)
            return build_error(
                message,
                upstream_status=status_code,
                checkout_response=response_data
            )
        
        # 解析JSON并提取checkout_session_id和publishable_key
        try:
            response_data = json.loads(content)
            checkout_session_id = response_data.get('checkout_session_id')
            publishable_key = response_data.get('publishable_key')
            短payurl = response_data.get('url')
            checkout_ui_mode = response_data.get('checkout_ui_mode')
            print("\n提取的信息:")
            print(f"checkout_session_id: {checkout_session_id}")
            print(f"payurl: {短payurl}")
            print(f"publishable_key: {publishable_key}")
            print(f"checkout_ui_mode: {checkout_ui_mode}")

            # Plus 当前更可能直接返回 hosted 链接，此时无需再走 Stripe init。
            if 短payurl and (checkout_ui_mode == "hosted" or plus):
                result = {
                    "status": "success",
                    "openai_payurl": 短payurl,
                    "checkout_ui_mode": checkout_ui_mode
                }
                if checkout_session_id:
                    result["chatgpt_payurl"] = "https://chatgpt.com/checkout/openai_llc/" + checkout_session_id
                return result

            if not checkout_session_id or not publishable_key:
                return build_error(
                    "上游返回缺少 checkout_session_id 或 publishable_key",
                    upstream_status=status_code,
                    checkout_response=response_data
                )

            # 构建Stripe API请求
            print("\n发送Stripe API请求...")
            stripe_url = f"https://api.stripe.com/v1/payment_pages/{checkout_session_id}/init"
            # 构建请求体
            payload = "browser_locale=zh-CN&browser_timezone=Asia%2FShanghai&elements_session_client[client_betas][0]=custom_checkout_server_updates_1&elements_session_client[client_betas][1]=custom_checkout_manual_approval_1&elements_session_client[elements_init_source]=custom_checkout&elements_session_client[referrer_host]=chatgpt.com&elements_session_client[stripe_js_id]=" + str(uuid.uuid4()) + "&elements_session_client[locale]=zh-CN&elements_session_client[is_aggregation_expected]=false&elements_options_client[stripe_js_locale]=auto&elements_options_client[saved_payment_method][enable_save]=never&elements_options_client[saved_payment_method][enable_redisplay]=never&key=" + publishable_key + "&_stripe_version=2025-03-31.basil%3B+checkout_server_update_beta%3Dv1%3B+checkout_manual_approval_preview%3Dv1"
            # 发送Stripe API请求
            stripe_response = client.post(
                url=stripe_url,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36"
                },
                data=payload,
                allow_redirects=True,
                proxy=proxy_url
            )
            print(f"请求状态: {stripe_response.status_code}")
            print("Stripe Response Content:")
            print(stripe_response.text)

            try:
                stripe_data = json.loads(stripe_response.text)
            except json.JSONDecodeError as e:
                return build_error(
                    f"解析 Stripe JSON 失败: {e}",
                    upstream_status=stripe_response.status_code,
                    checkout_response=response_data,
                    stripe_response={"raw": stripe_response.text}
                )

            if stripe_response.status_code >= 400:
                message = extract_upstream_message(stripe_data, stripe_response.status_code)
                return build_error(
                    message,
                    upstream_status=stripe_response.status_code,
                    checkout_response=response_data,
                    stripe_response=stripe_data
                )

            payurl = stripe_data.get('stripe_hosted_url')
            print(f"支付链接: {payurl}")

            if not payurl:
                return build_error(
                    "Stripe 返回中未找到支付链接",
                    upstream_status=stripe_response.status_code,
                    checkout_response=response_data,
                    stripe_response=stripe_data
                )

            # 返回结果
            return {
                "status": "success",
                "Stripe_payurl": payurl,
                "openai_payurl": 短payurl,
                "chatgpt_payurl": "https://chatgpt.com/checkout/openai_llc/" + checkout_session_id
            }
        except json.JSONDecodeError as e:
            print(f"\n解析JSON失败: {e}")
            return build_error(f"解析JSON失败: {e}")
    except Exception as e:
        print(f"请求失败: {e}")
        return build_error(f"请求失败: {e}")

@app.route('/api/request', methods=['POST', 'OPTIONS'])
def api_request():
    if request.method == 'OPTIONS':
        return '', 204

    # 获取请求参数
    data = request.get_json(silent=True)
    if not data:
        return jsonify({
            "status": "error",
            "message": "请提供JSON格式的请求参数"
        }), 400
    
    token = str(data.get('token', '')).strip()
    plus = bool(data.get('plus', False))
    
    if not token:
        return jsonify({
            "status": "error",
            "message": "缺少token参数"
        }), 400
    
    # 处理请求
    result = process_request(token, plus)
    status_code = 200 if result.get("status") == "success" else int(result.get("upstream_status") or 500)
    return jsonify(result), status_code

@app.route('/')
def index():
    return send_from_directory(os.path.dirname(os.path.abspath(__file__)), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    from flask import send_from_directory
    import os
    app_dir = os.path.dirname(os.path.abspath(__file__))
    if filename.endswith('.js'):
        return send_from_directory(app_dir, filename, mimetype='application/javascript')
    elif filename.endswith('.css'):
        return send_from_directory(app_dir, filename, mimetype='text/css')
    else:
        return send_from_directory(app_dir, filename)

if __name__ == "__main__":
    host = os.getenv("PAYMENT_SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("PAYMENT_SERVICE_PORT", "5001"))
    app.run(debug=True, host=host, port=port, use_reloader=False)
