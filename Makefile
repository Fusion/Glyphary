APP_NAME := MEdit
APP_BUNDLE := src-tauri/target/release/bundle/macos/$(APP_NAME).app
DMG := src-tauri/target/release/bundle/dmg/$(APP_NAME)_0.1.0_aarch64.dmg

.PHONY: help install dev web build check test audit prod-app release run-app open-app open-dmg clean

help:
	@echo "Targets:"
	@echo "  make install   Install npm dependencies"
	@echo "  make dev       Run the Tauri desktop app in development mode"
	@echo "  make web       Run the Vite browser preview at http://127.0.0.1:1420"
	@echo "  make build     Build the frontend"
	@echo "  make check     Typecheck/build frontend and check the Rust shell"
	@echo "  make test      Run frontend and Rust unit tests"
	@echo "  make audit     Run npm audit"
	@echo "  make prod-app  Build the production macOS .app"
	@echo "  make release   Build the production .app and .dmg"
	@echo "  make run-app   Open the built macOS .app"
	@echo "  make open-dmg  Open the built DMG"
	@echo "  make clean     Remove generated frontend and Rust build output"

install:
	npm install

dev:
	npm run tauri dev

web:
	npm run dev -- --host 127.0.0.1

build:
	npm run build

check: build
	cd src-tauri && cargo check

test:
	npm run test:frontend
	cd src-tauri && cargo test -- --test-threads=1

audit:
	npm audit

prod-app:
	npm run tauri build -- --bundles app

release:
	npm run tauri build

run-app:
	@test -d "$(APP_BUNDLE)" || (echo "$(APP_BUNDLE) does not exist. Run 'make release' first."; exit 1)
	open "$(APP_BUNDLE)"

open-app: run-app

open-dmg:
	@test -f "$(DMG)" || (echo "$(DMG) does not exist. Run 'make release' first."; exit 1)
	open "$(DMG)"

clean:
	rm -rf dist src-tauri/target
