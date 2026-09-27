# Shravanam Smriti - local development shortcuts.
# Requires: Docker (running), Node 22, make.

# `npm exec` (not `npx`) so a stray global npx on PATH cannot shadow npm's.
SUPABASE  := npm exec --yes --package=supabase@2 -- supabase
EXCLUDE   := realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor
APP_URL   := http://localhost:5173/shravanam-smriti/

.DEFAULT_GOAL := help
.PHONY: help up dev install env db-start db-stop db-reset db-test test test-web typecheck lint build check open studio mail clean ext-install ext ext-test ext-zip

help: ## Show this help
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-10s %s\n", $$1, $$2}'

up: dev ## Alias for dev

dev: db-start env install ## Start everything and open the app in your browser
	@echo ""
	@echo "  App     $(APP_URL)   (use the Quick sign-in buttons)"
	@echo "  Studio  http://127.0.0.1:54323"
	@echo "  Mail    http://127.0.0.1:54324"
	@echo ""
	@node scripts/open.mjs $(APP_URL) &
	cd web && npm run dev -- --port 5173 --strictPort

# Reinstall only when package-lock.json's contents change (timestamps are
# unreliable after git checkouts). Stop `make dev` first if a reinstall is needed
# on Windows, since the running server locks native binaries.
install: ## Install web dependencies (skipped when up to date)
	@cd web && hash=$$(node -e "process.stdout.write(require('crypto').createHash('sha1').update(require('fs').readFileSync('package-lock.json')).digest('hex'))") && 	if [ -f node_modules/.lock-hash ] && [ "$$(cat node_modules/.lock-hash)" = "$$hash" ]; then echo "web dependencies up to date"; 	else npm ci && echo "$$hash" > node_modules/.lock-hash; fi

env: ## Write web/.env.local from the running local Supabase
	@node scripts/dev-env.mjs

db-start: ## Start local Supabase (Postgres, Auth, Mailpit) in Docker
	@docker info >/dev/null 2>&1 || (echo "Docker is not running. Start Docker Desktop and retry." && exit 1)
	@$(SUPABASE) status >/dev/null 2>&1 || $(SUPABASE) start -x $(EXCLUDE) || 	  (echo "Waiting for the database containers to finish starting..." && sleep 15 && $(SUPABASE) status >/dev/null)

db-stop: ## Stop local Supabase
	$(SUPABASE) stop

db-reset: ## Recreate the local database from migrations + demo seed
	$(SUPABASE) db reset

db-test: db-start ## Run database (pgTAP) tests
	$(SUPABASE) test db

test-web: install ## Run frontend unit tests
	cd web && npm test

test: test-web ext-test db-test ## Run all tests

typecheck: install ## TypeScript check
	cd web && npx tsc -b

lint: install ## Lint the frontend
	cd web && npx oxlint src

build: install ## Production build into web/dist
	cd web && npm run build

check: typecheck lint test build ext ## Everything CI runs

open: ## Open the app in your browser
	@node scripts/open.mjs $(APP_URL)

studio: ## Open the local database UI
	@node scripts/open.mjs http://127.0.0.1:54323

mail: ## Open the local inbox (magic-link emails)
	@node scripts/open.mjs http://127.0.0.1:54324

ext-install: ## Install extension dependencies
	@cd extension && [ -d node_modules ] || npm ci

ext: ext-install ## Build the extension for local development (load extension/dist in Chrome)
	cd extension && npm run build:dev

ext-test: ext-install ## Typecheck and test the extension
	cd extension && npm run typecheck && npm test

ext-zip: ext-install ## Store-ready zip (needs SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL)
	cd extension && npm run zip

clean: ## Remove build output
	rm -rf web/dist extension/dist extension/*.zip
