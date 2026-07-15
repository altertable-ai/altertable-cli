# Altertable CLI — build automation
#
# `make` (default) compiles a standalone native binary for the current
# OS/architecture into dist/. The typed release manifest in
# cli/src/release-manifest.ts owns targets and artifact names.

CLI_DIR := cli

.DEFAULT_GOAL := build

# --- Compile native binary for the current architecture -------------------
.PHONY: build
build: $(CLI_DIR)/node_modules
	cd $(CLI_DIR) && bun run release:build --native

# Install dependencies only when the lockfile is newer than node_modules.
$(CLI_DIR)/node_modules: $(CLI_DIR)/bun.lock $(CLI_DIR)/package.json
	cd $(CLI_DIR) && bun install
	@touch $(CLI_DIR)/node_modules

.PHONY: install
install: $(CLI_DIR)/node_modules

# --- Cross-compile every released target ----------------------------------
.PHONY: cross
cross: $(CLI_DIR)/node_modules
	cd $(CLI_DIR) && bun run release:build --all

# --- Checks ---------------------------------------------------------------
.PHONY: test typecheck lint
test: $(CLI_DIR)/node_modules
	cd $(CLI_DIR) && bun test

typecheck: $(CLI_DIR)/node_modules
	cd $(CLI_DIR) && bun run typecheck

lint: $(CLI_DIR)/node_modules
	cd $(CLI_DIR) && bun run lint

# --- Housekeeping ---------------------------------------------------------
.PHONY: clean
clean:
	rm -rf dist $(CLI_DIR)/dist

.PHONY: help
help:
	@echo "Targets:"
	@echo "  build      Compile native binary for this host [default]"
	@echo "  cross      Cross-compile all four released targets"
	@echo "  install    Install CLI dependencies (bun install)"
	@echo "  test       Run unit tests (bun test)"
	@echo "  typecheck  Type-check the CLI (tsc --noEmit)"
	@echo "  lint       Lint the CLI (oxlint)"
	@echo "  clean      Remove build artifacts (dist/, cli/dist/)"
