# Altertable CLI — build automation
#
# `make` (default) compiles a standalone native binary for the current
# OS/architecture into dist/. Run from the repository root.

CLI_DIR := cli
SRC     := src/cli.ts

# --- Detect host OS/architecture and map to Bun's --target names ----------
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

ifeq ($(UNAME_S),Darwin)
  OS := darwin
else ifeq ($(UNAME_S),Linux)
  OS := linux
else
  $(error Unsupported OS '$(UNAME_S)' — supported: Darwin, Linux)
endif

ifeq ($(UNAME_M),arm64)
  ARCH := arm64
else ifeq ($(UNAME_M),aarch64)
  ARCH := arm64
else ifeq ($(UNAME_M),x86_64)
  ARCH := x64
else ifeq ($(UNAME_M),amd64)
  ARCH := x64
else
  $(error Unsupported architecture '$(UNAME_M)' — supported: arm64/aarch64, x86_64/amd64)
endif

TARGET := bun-$(OS)-$(ARCH)
BINARY := dist/altertable-$(OS)-$(ARCH)

.DEFAULT_GOAL := build

# --- Compile native binary for the current architecture -------------------
.PHONY: build
build: $(CLI_DIR)/node_modules
	@mkdir -p dist
	cd $(CLI_DIR) && bun build --compile --target=$(TARGET) $(SRC) --outfile ../$(BINARY)
	@echo "Built $(BINARY) (target $(TARGET))"

# Install dependencies only when the lockfile is newer than node_modules.
$(CLI_DIR)/node_modules: $(CLI_DIR)/bun.lock $(CLI_DIR)/package.json
	cd $(CLI_DIR) && bun install
	@touch $(CLI_DIR)/node_modules

.PHONY: install
install: $(CLI_DIR)/node_modules

# --- Cross-compile every released target ----------------------------------
.PHONY: cross
cross: $(CLI_DIR)/node_modules
	@mkdir -p dist
	cd $(CLI_DIR) && bun build --compile --target=bun-darwin-arm64 $(SRC) --outfile ../dist/altertable-darwin-arm64
	cd $(CLI_DIR) && bun build --compile --target=bun-darwin-x64   $(SRC) --outfile ../dist/altertable-darwin-x64
	cd $(CLI_DIR) && bun build --compile --target=bun-linux-x64    $(SRC) --outfile ../dist/altertable-linux-x64
	cd $(CLI_DIR) && bun build --compile --target=bun-linux-arm64  $(SRC) --outfile ../dist/altertable-linux-arm64

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
	@echo "  build      Compile native binary for this host ($(TARGET)) [default]"
	@echo "  cross      Cross-compile all four released targets"
	@echo "  install    Install CLI dependencies (bun install)"
	@echo "  test       Run unit tests (bun test)"
	@echo "  typecheck  Type-check the CLI (tsc --noEmit)"
	@echo "  lint       Lint the CLI (oxlint)"
	@echo "  clean      Remove build artifacts (dist/, cli/dist/)"
