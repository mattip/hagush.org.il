# Cloudflare Configuration — hagush.org.il

## DNS Records
See `dns.txt` (exported via Cloudflare dashboard → DNS → Export)

## Workers
### form-proxy
- Route: `hagush.org.il/api/question*`
- Source: `form-proxy.js`
- Purpose: proxies form POSTs to Google Apps Script
  to hide script.google.com from client-side scanners

## Managed Transforms (Rules → Settings)
See `rules.png`
