# Dockerfile Configuration

> Learn how to configure your Dockerfile for Smithery MCP servers.

# Dockerfile Configuration

Create a `Dockerfile` in your repository root that defines how to build your MCP server. Your Dockerfile should be created such that running your Docker image will start your [STDIO server](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#stdio).

## Example Dockerfile

Here's an example Dockerfile that builds a Node-based MCP server:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Command will be provided by smithery.yaml
CMD ["node", "dist/index.js"]
```

## Requirements

**We only support Linux Docker images on major distros (Alpine/Debian-based) and expect `sh` to run in your container. Other distros are untested and may not deploy.**

## Examples

You can find examples of Dockerfiles in Smithery's [reference implementations](https://github.com/smithery-ai/reference-servers/tree/main/src).

## Related Configuration

### smithery.yaml

Create a `smithery.yaml` file in your repository root. This file defines the server type, how the MCP server should be started and its configuration options.

```yaml
# Smithery.ai configuration
startCommand:
    type: stdio
    configSchema:
      # JSON Schema defining the configuration options for the MCP.
      {}
    commandFunction:
      # A function that produces the CLI command to start the MCP on stdio.
      |-
      (config) => ({
        "command": "node",
        "args": [
          "dist/index.js"
        ],
        "env": {
          ...
        }
      })
```
