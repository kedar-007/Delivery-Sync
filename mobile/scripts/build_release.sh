#!/usr/bin/env bash
# Build signed release artifacts for upload to Catalyst MDM.
#
# Produces:
#   • android: build/app/outputs/flutter-apk/app-release.apk
#   • ios:     build/ios/ipa/delivery_sync.ipa  (macOS + Xcode required)
#
# Run from the mobile/ directory:
#   ./scripts/build_release.sh          # both platforms
#   ./scripts/build_release.sh android  # android only
#   ./scripts/build_release.sh ios      # ios only
#
# Prereqs:
#   • Flutter SDK >= 3.19
#   • Android: keystore + key.properties configured (see android/key.properties.example)
#   • iOS:     Apple Developer account + signing certificate + provisioning profile
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:-both}"

echo "──────────────────────────────────────────────────────────"
echo "  DSV OpsPulse — Release build"
echo "  Target: $TARGET"
echo "──────────────────────────────────────────────────────────"

# ── Sanity check ──────────────────────────────────────────────
if ! command -v flutter >/dev/null 2>&1; then
  echo "✗ Flutter not on PATH. Install: https://docs.flutter.dev/get-started/install" >&2
  exit 1
fi

echo "→ flutter pub get"
flutter pub get

# ── Android ──────────────────────────────────────────────────
build_android() {
  echo ""
  echo "──── Android ────────────────────────────────────────────"
  if [ ! -f android/key.properties ]; then
    echo "✗ android/key.properties not found." >&2
    echo "  Create it with your signing config — see android/key.properties.example." >&2
    exit 1
  fi
  echo "→ flutter build apk --release"
  flutter build apk --release
  echo "✓ APK ready: build/app/outputs/flutter-apk/app-release.apk"
  ls -lh build/app/outputs/flutter-apk/app-release.apk
}

# ── iOS ──────────────────────────────────────────────────────
build_ios() {
  echo ""
  echo "──── iOS ────────────────────────────────────────────────"
  if [ "$(uname)" != "Darwin" ]; then
    echo "✗ iOS builds require macOS." >&2
    exit 1
  fi
  if ! command -v xcodebuild >/dev/null 2>&1; then
    echo "✗ Xcode command-line tools missing. Install: xcode-select --install" >&2
    exit 1
  fi
  echo "→ flutter build ipa --release"
  flutter build ipa --release
  echo "✓ IPA ready: build/ios/ipa/delivery_sync.ipa"
  ls -lh build/ios/ipa/*.ipa
}

case "$TARGET" in
  android) build_android ;;
  ios)     build_ios ;;
  both)
    build_android
    build_ios
    ;;
  *)
    echo "Unknown target: $TARGET (use: android | ios | both)" >&2
    exit 1
    ;;
esac

echo ""
echo "──────────────────────────────────────────────────────────"
echo "  Build complete. Next: upload via Catalyst MDM console."
echo "  See mobile/MDM_DEPLOY.md for the upload checklist."
echo "──────────────────────────────────────────────────────────"
