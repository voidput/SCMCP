#!/bin/bash

set -e

echo "Building SCMCP..."
npm install
npm run build

MCP_COMMAND="node $(pwd)/dist/index.js"

# Pass UEXTOKEN through to the MCP registration. The server is spawned by the
# client in the client's working directory, so dotenv will not find this repo's
# .env file — without this the token has to be exported globally.
MCP_ENV_ARGS=()
if [ -n "$UEXTOKEN" ]; then
    MCP_ENV_ARGS=(-e "UEXTOKEN=$UEXTOKEN")
else
    echo "⚠️  UEXTOKEN is not set in this shell; registering without it."
    echo "   Set it and re-run, or add it to the MCP config by hand."
fi

echo ""
echo "Attempting to install Star Citizen MCP for Claude Code..."
if command -v claude &> /dev/null; then
    claude mcp add scmcp "${MCP_ENV_ARGS[@]}" -- $MCP_COMMAND
    echo "✅ Successfully added to Claude Code."
else
    echo "⚠️  Claude Code CLI not found. Skipping."
fi

echo ""
echo "Attempting to install Star Citizen MCP for Gemini CLI..."
if command -v gemini &> /dev/null; then
    # Assuming Gemini uses a similar plugin command or config structure
    gemini mcp add scmcp "${MCP_ENV_ARGS[@]}" -- $MCP_COMMAND
    echo "✅ Successfully added to Gemini."
else
    echo "⚠️  Gemini CLI not found. To manually add, use the following command:"
    echo "node $(pwd)/dist/index.js"
fi

echo ""
echo "Installation process finished! Don't forget to set your UEXTOKEN in your environment or MCP config if you haven't already."