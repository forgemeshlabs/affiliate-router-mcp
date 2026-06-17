# Glama release build

Use this repository's Dockerfile for the Glama Dockerfile admin page:

```text
https://glama.ai/mcp/servers/forgemeshlabs/affiliate-router-mcp/admin/dockerfile
```

If the admin page asks for build steps, use:

```text
npm ci --omit=dev
```

CMD arguments:

```json
["node", "index.js"]
```

Environment variables schema:

```json
{
  "type": "object",
  "properties": {
    "PARTNERSTACK_CODE": {
      "description": "PartnerStack referral code",
      "type": "string"
    },
    "GUMROAD_AFFILIATE_ID": {
      "description": "Gumroad tracking ID",
      "type": "string"
    },
    "PYRIMID_AFFILIATE_ID": {
      "description": "Default affiliate ID for Pyrimid-registered products",
      "type": "string"
    },
    "WALLET_PRIVATE_KEY": {
      "description": "Base wallet private key for x402 adapters",
      "type": "string"
    }
  },
  "required": []
}
```

Runtime notes:

- Transport: stdio
- Authentication: optional environment variables only
- No inbound HTTP port is required
