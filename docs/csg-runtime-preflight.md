# CSG Runtime Preflight

A fail-closed configuration check for an intended MCP attachment through Aegis CSG.

## Run

From the repository root:

```bash
node scripts/csg-runtime-preflight.mjs \
  --config ./mcp.json \
  --server agent-tools \
  --proxy-path scripts/csg-mcp-proxy.mjs
```

The selected entry must exist under `mcpServers` (or `servers`) and its command/arguments must reference the expected proxy path. Secret-like environment variable names are reported, but values are never printed.

## Test

```bash
node --test scripts/csg-runtime-preflight.test.mjs
```

## Status and limitations

- A non-zero exit means the configuration is not ready for the intended proxy route.
- `PREFLIGHT_PASS` means only that the inspected file is structurally configured to reference the proxy.
- This tool does **not** prove that a running agent loads this configuration, that the proxy itself is secure, or that direct MCP bypass routes are blocked. Those require a live integration test against the actual agent host and MCP server.
- Do not commit credentials or paste tokens into chat.
