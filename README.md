# Card Auto Preview

A small local redemption site with a Node backend, a Notion lookup flow, and masked card-display output.

## What it does

- Accepts a CDK from the browser
- Looks up the matching entry in Notion or a local demo store
- Marks the Notion row as used after a successful redemption
- Returns only masked display data to the browser
- Never renders CVV, raw PAN, or SMS URLs on the page

## Files

- `server.mjs`: local backend and Notion integration
- `index.html`, `styles.css`, `app.js`: redemption UI
- `.env.example`: environment variable template

## Run locally

1. Copy `.env.example` to `.env` and fill in your Notion values if you want live Notion mode.
2. Start the server:

```bash
node server.mjs
```

3. Open [http://localhost:8000](http://localhost:8000).

If no Notion variables are configured, the app falls back to demo mode. You can test with `DEMO-001`.

## Recommended Notion schema

Use a Notion database or data source with these columns:

- `CDK`: `title` or `rich_text`
- `Used`: `checkbox`
- `Redeemed At`: `date`
- `Payload JSON`: `rich_text`

Example `Payload JSON` value:

```json
{
  "orderNo": "R202604200001",
  "categoryName": "4859",
  "cardNumber": "4859 **** **** 2002",
  "expiry": "2030/06",
  "phone": "+1******5942",
  "holderName": "Todd Sellers",
  "address": "2555 Howerton Court, Charlotte 28270, US",
  "activatedAt": "2026-04-20T09:20:00.000Z",
  "expiresAt": "2030-06-01T00:00:00.000Z",
  "instruction": "手机号仅用于 3DS 与消费验证码。",
  "isFirstAssignment": true
}
```

The backend also supports field-by-field fallback properties if `Payload JSON` is absent.

## Notes

- This implementation does not wire the external card-provider endpoint.
- The backend re-masks card and phone values before returning them, even if the source data is less strict.
- Notion updates are not transactional, so simultaneous redemptions of the same CDK can still race under high concurrency.
