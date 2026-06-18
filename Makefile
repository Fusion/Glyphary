APP_NAME := Glyphary
APP_BUNDLE := src-tauri/target/release/bundle/macos/$(APP_NAME).app
DMG := src-tauri/target/release/bundle/dmg/$(APP_NAME)_0.1.0_aarch64.dmg

.PHONY: help install dev web docs docs-open manual manual-open build check test audit prod-app release run-app open-app open-dmg ship-dmg clean

help:
	@echo "Targets:"
	@echo "  make install   Install npm dependencies and prepare rust targets"
	@echo "  make dev       Run the Tauri desktop app in development mode"
	@echo "  make web       Run the Vite browser preview at http://127.0.0.1:1420"
	@echo "  make docs      Serve the Voilà-style product page at http://127.0.0.1:4174/docs-site/glyphary.html"
	@echo "  make docs-open Open the Voilà-style product page file directly"
	@echo "  make manual    Serve the user manual at http://127.0.0.1:4174/docs-manual/"
	@echo "  make manual-open Open the user manual file directly"
	@echo "  make build     Build the frontend"
	@echo "  make check     Typecheck/build frontend and check the Rust shell"
	@echo "  make test      Run frontend and Rust unit tests"
	@echo "  make audit     Run npm audit"
	@echo "  make prod-app  Build the production macOS .app"
	@echo "  make release   Build the production .app and .dmg"
	@echo "  make run-app   Open the built macOS .app"
	@echo "  make open-dmg  Open the built DMG"
	@echo "  make ship-dmg  DMGgn, notarize, stable for distribution on github"
	@echo "  make clean     Remove generated frontend and Rust build output"

install:
	npm install
	rustup target add aarch64-apple-darwin x86_64-apple-darwin

dev:
	npm run tauri dev

web:
	npm run dev -- --host 127.0.0.1

docs:
	python3 -m http.server 4174 --bind 127.0.0.1

docs-open:
	open docs-site/glyphary.html

manual:
	python3 -m http.server 4174 --bind 127.0.0.1

manual-open:
	open docs-manual/index.html

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
	npm run tauri build -- --target universal-apple-darwin

run-app:
	@test -d "$(APP_BUNDLE)" || (echo "$(APP_BUNDLE) does not exist. Run 'make release' first."; exit 1)
	open "$(APP_BUNDLE)"

open-app: run-app

open-dmg:
	@test -f "$(DMG)" || (echo "$(DMG) does not exist. Run 'make release' first."; exit 1)
	open "$(DMG)"

ship-dmg: release
	@set -e; \
	export APPLE_SIGNING_IDENTITY="$$( \
	  security find-identity -p codesigning -v \
	    | grep 'Developer ID Application' \
	    | head -n1 \
	    | awk -F'"' '{print $$2}' \
	)"; \
	DMG="$$(ls -t src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg | head -n1)"; \
	xcrun notarytool submit "$$DMG" --keychain-profile "notary-profile" --wait; \
	xcrun stapler staple "$$DMG"; \
	xcrun stapler validate "$$DMG"; \
	spctl -a -t open --context context:primary-signature -v "$$DMG"; \
	echo "Final path: $$DMG";

clean:
	rm -rf dist src-tauri/target
