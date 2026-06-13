# <img src="packages/zowe-mcp-vscode/resources/icon.svg" alt="Zowe MCP" style="height:1.2em; vertical-align: text-top;" /> Zowe MCP

Model Context Protocol (MCP) server that gives AI assistants tools for working
with z/OS systems -- data sets, jobs, and UNIX System Services. Works with any
MCP-capable client (Claude Code, Cursor, VS Code, Zed, Roo Code, and others).
An optional [VS Code extension](#vs-code-extension-optional) is also included.

## Use case examples

The AI can combine multiple tools and reason over results to:

- **AI-assisted development** — Browse, search, read, and open data sets and USS in natural language; get explanations and open in editor.
- **Job failure diagnostics** — "Why did this job fail?" The assistant fetches status and spool, finds errors/ABENDs, and explains cause and next steps.
- **Search and trace** — Find where a program, copybook, or string is used or defined across libraries; get a short report and suggested next reads.

See [Use cases](docs/use-cases.md) for the full list and more detail.

## How it works

The MCP server runs locally and registers tools with your editor or AI
assistant. To carry out those tools against a real system, it connects over
SSH to the [Zowe Remote SSH](https://github.com/zowe/zowex) server component
(`zowex`) running on z/OS and exchanges JSON-RPC requests with it.

A filesystem-backed [mock backend](#mock-mode) is also included so you can
try the tools without a mainframe.

## Prerequisites

### Local

- **Node.js** >= 22 (LTS recommended)
- **npm** >= 10 (ships with Node 22+)
- An MCP-capable editor or AI assistant

### On z/OS (native backend only)

- SSH access with a user ID and password
- The minimum SAF / RACF authority needed for the task — see
  [Safety and security](#safety-and-security)
- The [Zowe Remote SSH](https://github.com/zowe/zowex) server component
  (`zowex`) installed on the system

## Installation

> [!NOTE]
> `@zowe/mcp-server` is not yet published to the npm registry, so it cannot
> be run with `npx` — install from source as described below.

```bash
# 1. Clone and install dependencies
git clone <repo-url> zowe-mcp
cd zowe-mcp
npm install

# 2. Fetch the Zowe Remote SSH SDK (required for the native backend)
npm run sdk:release

# 3. Build
npm run build
```

Step 2 fetches the latest stable release of the
[Zowe Remote SSH](https://github.com/zowe/zowex) SDK (`zowex-sdk`). Use
`npm run sdk:nightly` for the latest nightly build instead.

After step 3, the server entry point is at:

```text
<repo>/packages/zowe-mcp-server/dist/index.js
```

You will reference this absolute path when configuring your editor.

## Connect to z/OS (native backend)

The native backend implements the full set of z/OS operations: data set
CRUD (list, read, write, create, delete, copy, rename, restore, search,
attributes), USS file operations (list, read, write, create, delete, chmod,
chown, chtag, copy), TSO commands, and job management (submit, status, list,
output, cancel, hold, release, delete).

Connection format is `user@hostname` or `user@hostname:port` (default port 22),
same as SSH. Systems come from a config file or CLI:

```bash
# CLI (repeatable)
node packages/zowe-mcp-server/dist/index.js --stdio --native --system USERID@sys1.example.com

# Config file (JSON with "systems" array)
node packages/zowe-mcp-server/dist/index.js --stdio --native --config ./native-config.json
```

Config file format:

```json
{
  "systems": [
    "user1@host1.example.com",
    "user2@host2.example.com:22"
  ]
}
```

### Passwords

Password is currently the only supported authentication method (key-based
authentication is not yet supported, although the underlying Zowe Remote SSH
protocol allows it). Passwords are read from environment variables:
`ZOWE_MCP_PASSWORD_<USER>_<HOST>` (user and host uppercase, dots in host
replaced by `_`). Example for `USERID@sys1.example.com`:

```bash
export ZOWE_MCP_PASSWORD_USERID_SYS1_EXAMPLE_COM=password
```

Set this in the environment your editor inherits (for example in your shell
profile) so it never lands in a config file you might commit. If a password
is invalid, the server will not retry it for the rest of the process.

You cannot use both mock mode and native mode; if both are configured, native
wins.

## Configure your editor

Add the following config to your MCP client, replacing the path with the
absolute path to your built `dist/index.js`:

```json
{
  "mcpServers": {
    "zowe": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/zowe-mcp/packages/zowe-mcp-server/dist/index.js",
        "--stdio",
        "--native",
        "--system",
        "USERID@sys1.example.com"
      ]
    }
  }
}
```

<details>
<summary><b>VS Code</b></summary>

Create or edit `.vscode/mcp.json` in your workspace using the standard config
from above, with `"servers"` as the top-level key instead of `"mcpServers"`.

</details>

<details>
<summary><b>Claude Code</b></summary>

Add the standard config from above to `.mcp.json` in your project root, or
use the CLI:

```bash
claude mcp add zowe -- node /absolute/path/to/zowe-mcp/packages/zowe-mcp-server/dist/index.js --stdio --native --system USERID@sys1.example.com
```

</details>

<details>
<summary><b>Cursor</b></summary>

Add the standard config from above to `~/.cursor/mcp.json` (global) or
`.cursor/mcp.json` (project).

</details>

<details>
<summary><b>Roo Code</b></summary>

Add the standard config from above to `.roo/mcp.json`. See also
[Roo and standalone MCP](docs/roo-or-standalone-mcp.md).

</details>

<details>
<summary><b>Other clients</b></summary>

Check your client's MCP documentation for the config file location and
whether it expects `mcpServers` or `servers` as the top-level key. The server
block is the same either way. If your client does not forward your shell
environment, pass the password variable in an `env` block instead — only in a
local, uncommitted config file:

```json
      "env": {
        "ZOWE_MCP_PASSWORD_USERID_SYS1_EXAMPLE_COM": "password"
      }
```

</details>

After reloading your editor, you can confirm the setup by asking the
assistant to use the `getContext` tool to show the Zowe MCP server version.

## Safety and security

AI agents can make mistakes. When an agent has tools that modify or delete
mainframe resources, an incorrect action can cause real damage. Zowe MCP
provides multiple layers of protection — use them together.

**Read the full guide:** [Safety & Security principles](docs/mcp-safety-security-principles.md)

### Key recommendations

1. **Principle of least privilege** — Grant only the capability tier needed for
   the task. Start with `read-strict` (the default) and raise it only when
   required. A narrower tier limits the blast radius of any mistake.

2. **Progressive capability tiers** — Each tool declares a *resource effect
   level* (none → read → update → delete → execute). The operator-configured
   *capability tier* controls which tools register and how MCP clients treat
   them:

   | Tier | What the agent can do |
   | --- | --- |
   | `read-strict` (default) | Read only, with client confirmation prompts |
   | `read` | Read only, auto-approved |
   | `update` | Read + create/write/modify |
   | `delete` | Read + update + delete/cancel |
   | `full` | Everything including job submit and command execution |

   Configure via `--capability-tier <tier>`, env `ZOWE_MCP_CAPABILITY_TIER`,
   or VS Code setting `zoweMCP.capabilityTier`.

3. **Dedicated z/OS credentials** — Use a dedicated SSH user with the minimum
   SAF / RACF authority needed. The z/OS security system is the ultimate
   enforcement boundary — even if the MCP layer or the AI model fails, SAF
   ensures the agent cannot exceed its authority.

4. **Command safety gates** — TSO and USS command tools use pattern-based
   evaluation (block / elicit / allow) to catch dangerous commands before
   execution.

5. **Mock mode for learning** — Use the mock backend for exploration and
   CI — no real z/OS resources are at risk.

6. **Safety is not security** — Client hints, confirmation dialogs, and
   command gates reduce *accidents*. Only z/OS access controls (SAF, USS
   ACLs, scheduler exits) and credential management *enforce* real
   boundaries.

## Mock mode

The server includes a filesystem-backed mock z/OS backend so you can try the
tools without a real mainframe.

### Generating mock data

```bash
# Default preset (2 systems, 2 users each, ~8 datasets per user)
node packages/zowe-mcp-server/dist/index.js init-mock --output ./zowe-mcp-mock-data

# Minimal (1 system, 1 user, 5 datasets)
node packages/zowe-mcp-server/dist/index.js init-mock --output ./zowe-mcp-mock-data --preset minimal

# Large (5 systems, 3 users each, 20 datasets per user)
node packages/zowe-mcp-server/dist/index.js init-mock --output ./zowe-mcp-mock-data --preset large

# Custom scale
node packages/zowe-mcp-server/dist/index.js init-mock --output ./zowe-mcp-mock-data \
  --systems 3 --users-per-system 2 --datasets-per-user 10 --members-per-pds 8
```

The generated directory looks like:

```text
zowe-mcp-mock-data/
  systems.json                          # System definitions + credentials
  mainframe-dev.example.com/            # One directory per system
    USER/                               # HLQ directory
      SRC.COBOL/                        # PDS — directory with members
        HELLO.cbl                       # Member file
        _meta.json                      # Dataset attributes
      LOAD.JCL                          # Sequential dataset — plain file
```

### Running with mock data

Use `--mock` (or env `ZOWE_MCP_MOCK_DIR`) in place of `--native` in your
editor config or on the command line:

```bash
node packages/zowe-mcp-server/dist/index.js --stdio --mock ./zowe-mcp-mock-data
```

## VS Code extension (optional)

The repository also includes a VS Code extension that registers the MCP
server with GitHub Copilot Chat automatically. It provides a bidirectional
communication channel for log forwarding, dynamic configuration, and password
prompts via VS Code Secret Storage. If you configure the server through
`mcp.json` as described above, you do not need the extension.

**New to the extension?** See the
**[Copilot setup guide](docs/copilot-setup-guide.md)** for installing from a
VSIX, configuring Gemini (e.g. for Broadcom), defining `user@host`, and
Copilot/MCP tips. For hands-on checklists, see
**[Manual QA](docs/manual-qa/README.md)**.

Requires **VS Code** >= 1.101 with the **GitHub Copilot Chat** extension
installed.

### Install

```bash
# Build and install in one step
npm run build-and-install

# Or, to install into Cursor / VS Code Insiders / Codium:
VSCODE_CLONE=cursor npm run build-and-install
```

After installation, reload VS Code. The extension activates on startup and
registers a "Zowe" MCP server provider.

### Native connections

1. Open Settings and search for **Zowe MCP**
2. Set **Native connections** to an array of SSH connection specs, e.g.
   `["USERID@sys1.example.com"]`. Each entry is one connection (user@host or
   user@host:port); you can have multiple connections to the same z/OS system
   (e.g. different user IDs).
3. Reload the window so the MCP server restarts with `--native`

When the server needs a password it sends a request to the extension; the
extension prompts (or reads from VS Code Secret Storage) and sends the password
back. Passwords are stored under the shared Zowe OSS key
`zowe.ssh.password.<user>.<hostNormalized>` so other Zowe extensions can reuse
them. If a password is invalid the extension deletes it from storage.

Server and extension logs include a **passwordHash** (first 16 hex characters of
SHA-256 of the password in UTF-8) so you can correlate log lines without
exposing the password. To verify or reproduce the hash from the command line
(use `-n` so no newline is included):

```bash
echo -n 'YOUR_EXACT_PASSWORD' | sha256sum
```

Take the first 16 characters of the output; they should match the `passwordHash`
in the logs when the same password is used.

### Mock mode in the extension

By default the extension starts the server without a z/OS backend, so only
the `getContext` tool is available. A warning notification will appear with buttons
to help you configure mock data.

Use the built-in command (easiest):

1. Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Run **Zowe MCP: Generate Mock Data**
3. Select a folder where mock data should be created
4. The command generates the data, configures the setting, and offers to
   reload the window

Or point at an existing mock data directory via the **Mock Data Dir** setting,
or in `settings.json`:

```jsonc
{
  "zoweMCP.mockDataDirectory": "/absolute/path/to/zowe-mcp-mock-data"
}
```

## Development and contributing

For repository layout, build variants, the SDK fetch scripts, testing, the
MCP Inspector, running AI evaluations, releases, and vendor extensions, see
[DEVELOPMENT.md](DEVELOPMENT.md). For contribution conventions — commit
sign-off, pull request and AI evaluation requirements, and code style — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Eclipse Public License v2.0](https://www.eclipse.org/legal/epl-v20.html)
