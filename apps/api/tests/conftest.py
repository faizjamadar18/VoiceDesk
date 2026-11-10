"""Shared test setup.

MCP is forced off for the whole suite so importing ``app.main`` (which builds
the module-level ``app``) never spawns a server process or reads a developer's
real ``mcp_servers.json``. Tests that exercise the wiring inject a fake
manager into :func:`create_app` instead.

``KESTREL_MCP_ENABLED`` is set before any test module imports ``app.main``.
``python-dotenv`` does not override an already-set variable, so a real ``.env``
cannot turn MCP back on underneath the suite.
"""

from __future__ import annotations

import os

os.environ["KESTREL_MCP_ENABLED"] = "0"
# Tool retrieval is also forced off so the suite never imports fastembed or
# loads the embedding model. Tests that exercise it inject a fake embedder.
os.environ["KESTREL_TOOL_RETRIEVAL"] = "0"