FROM node:22-slim

WORKDIR /app

# Install git (needed for clone) and enable corepack
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable

# Clone only the mcp directory from the stable branch
RUN git clone --branch mcp-prod --depth 1 https://github.com/penpot/penpot.git /tmp/penpot && \
    mv /tmp/penpot/mcp/* /tmp/penpot/mcp/.* /app/ 2>/dev/null || true && \
    rm -rf /tmp/penpot .git

# Install dependencies and build
RUN corepack install && \
    pnpm -r install && \
    pnpm -r run build

# Run as non-root user
RUN useradd --create-home --shell /bin/bash mcp && \
    chown -R mcp:mcp /app
USER mcp

# MCP HTTP/SSE server
EXPOSE 4401
# Plugin web server
EXPOSE 4400
# WebSocket server
EXPOSE 4402

CMD ["pnpm", "-r", "--parallel", "run", "start"]
