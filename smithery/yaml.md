# smithery.yaml Reference

> Reference documentation for the smithery.yaml configuration file.

# smithery.yaml Reference

The `smithery.yaml` file provides configuration for your Model Context Protocol (MCP) server on Smithery. This file must be placed in your repository root.

## Configuration Options

### runtime (Optional)

**Type**: String\
**Default**: Auto-assigned by Smithery

Specifies the deployment runtime for your MCP server:

* `"typescript"` - Uses the Smithery CLI to build your TypeScript project directly
* `"container"` - Uses Docker containers for deployment (supports any language)

If not specified, Smithery will automatically assign the appropriate runtime based on your project structure.

***

## TypeScript Runtime Configuration

When using `runtime: "typescript"`, Smithery uses the [Smithery CLI](https://github.com/smithery-ai/cli) to build your TypeScript MCP server directly. This is the recommended approach for TypeScript projects.

```yaml
runtime: typescript
env:
  NODE_ENV: production
```

| Property  | Type   | Description                                                       |
| --------- | ------ | ----------------------------------------------------------------- |
| `runtime` | string | Must be set to `"typescript"`                                     |
| `env`     | object | Optional environment variables to inject when running your server |

With TypeScript runtime, your server will be built using `@smithery/cli build` and deployed as a streamable HTTP server. We recommend using our [TypeScript SDK](https://github.com/smithery-ai/sdk) for the best experience.

***

## Container Runtime Configuration

When using `runtime: "container"` (or when runtime is not specified), Smithery uses Docker containers to build and deploy your server. This supports any programming language.

### startCommand

**Type**: Object (Required for container runtime)

Defines how to start your MCP server. The structure varies based on the server type you're using.

Smithery supports two types of MCP servers: HTTP and STDIO. Choose the appropriate configuration based on your server implementation.

#### HTTP Server Configuration

```yaml
runtime: container  # Optional - this is the default
startCommand:
  type: http
  configSchema: object
```

| Property       | Type   | Description                                                                                                                                     |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`         | string | Must be set to `"http"` for HTTP-based MCP servers                                                                                              |
| `configSchema` | object | JSON Schema defining the configuration options for your server. Smithery uses this to validate user configurations before starting your server. |

With HTTP servers, Smithery will start your application and route MCP traffic to the `/mcp` endpoint under the provided `PORT` environment variable. Your server needs to implement the [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) protocol and handle configuration objects passed via the query parameter.

**Example HTTP Configuration:**

```yaml
startCommand:
  type: http
  configSchema:
    type: object
    required: ["apiKey"]
    properties:
      apiKey:
        type: string
        title: "API Key"
        description: "Your API key"
      temperature:
        type: number
        default: 0.7
        minimum: 0
        maximum: 1
```

#### STDIO Server Configuration

```yaml
runtime: container  # Optional - this is the default
startCommand:
  type: stdio
  configSchema: object
  commandFunction: string
```

| Property          | Type   | Description                                                                                                                                     |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | string | Must be set to `"stdio"` for standard I/O based MCP servers                                                                                     |
| `configSchema`    | object | JSON Schema defining the configuration options for your server. Smithery uses this to validate user configurations before starting your server. |
| `commandFunction` | string | A JavaScript function that returns the command, arguments and environment variables required to start your server. See details below.           |

#### commandFunction Details

This JavaScript function receives a validated `config` object and must return an object with the following properties:

```js
(config) => ({
  command: string, // The command to execute
  args: string[],  // Array of command arguments
  env: object      // Environment variables as key-value pairs
})
```

You can trust that the `config` parameter conforms to your defined `configSchema`.

### build (Optional)

**Type**: Object (Only for container runtime)

Contains build configuration options for your server when using container runtime.

```yaml
runtime: container  # Optional - this is the default
build:
  dockerfile: string
  dockerBuildPath: string
```

| Property          | Type   | Description                                                                       |
| ----------------- | ------ | --------------------------------------------------------------------------------- |
| `dockerfile`      | string | Path to Dockerfile, relative to the smithery.yaml file. Defaults to "Dockerfile"  |
| `dockerBuildPath` | string | Path to docker build context, relative to the smithery.yaml file. Defaults to "." |

### env (Optional)

**Type**: Object

Environment variables to inject when running your server (available for both runtime types).

```yaml
env:
  NODE_ENV: production
  DEBUG: "true"
```
