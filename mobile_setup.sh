#!/usr/bin/env bash
# ============================================================
#  DSV-One · Delivery Sync Mobile — Mac M3 Setup Script
#  Target : MacBook Air M3 (Apple Silicon arm64)
#  Installs: Flutter, Dart, Android Studio, Android SDK,
#            Xcode CLI, CocoaPods, VS Code extensions,
#            Homebrew, Git, Node.js
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()    { echo -e "${GREEN}✔ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
die()   { echo -e "${RED}✖ $1${NC}"; exit 1; }

# ── 0. Rosetta 2 (needed for some Intel-only tools) ──────────────────────────
step "Checking Rosetta 2"
if ! /usr/bin/pgrep -q oahd; then
  warn "Rosetta 2 not active — installing"
  softwareupdate --install-rosetta --agree-to-license
fi
ok "Rosetta 2 ready"

# ── 1. Xcode Command Line Tools ───────────────────────────────────────────────
step "Xcode Command Line Tools"
if ! xcode-select -p &>/dev/null; then
  warn "Installing Xcode CLI tools…"
  xcode-select --install
  echo "Press any key once the Xcode installer finishes, then re-run this script."
  read -n1; exit 0
fi
ok "Xcode CLI tools installed at $(xcode-select -p)"

# ── 2. Homebrew ───────────────────────────────────────────────────────────────
step "Homebrew"
if ! command -v brew &>/dev/null; then
  warn "Installing Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi
brew update --quiet
ok "Homebrew $(brew --version | head -1)"

# ── 3. Git ────────────────────────────────────────────────────────────────────
step "Git"
brew install git 2>/dev/null || true
ok "Git $(git --version)"

# ── 4. Node.js (LTS) ─────────────────────────────────────────────────────────
step "Node.js"
if ! command -v node &>/dev/null; then
  brew install node
fi
ok "Node $(node -v) / npm $(npm -v)"

# ── 5. Flutter SDK ────────────────────────────────────────────────────────────
step "Flutter SDK"
FLUTTER_DIR="$HOME/flutter"
if [ ! -d "$FLUTTER_DIR" ]; then
  warn "Cloning Flutter stable…"
  git clone https://github.com/flutter/flutter.git -b stable "$FLUTTER_DIR"
fi

# Add flutter to PATH for this session
export PATH="$FLUTTER_DIR/bin:$PATH"

# Add to shell profile permanently
SHELL_RC="$HOME/.zshrc"
if ! grep -q 'flutter/bin' "$SHELL_RC" 2>/dev/null; then
  echo '' >> "$SHELL_RC"
  echo '# Flutter' >> "$SHELL_RC"
  echo "export PATH=\"\$HOME/flutter/bin:\$PATH\"" >> "$SHELL_RC"
  ok "Added Flutter to $SHELL_RC"
fi

flutter --version
ok "Flutter SDK at $FLUTTER_DIR"

# ── 6. Android Studio ─────────────────────────────────────────────────────────
step "Android Studio"
if [ ! -d "/Applications/Android Studio.app" ]; then
  warn "Installing Android Studio via Homebrew Cask…"
  brew install --cask android-studio
fi
ok "Android Studio installed"

# ── 7. Android SDK & Emulator ─────────────────────────────────────────────────
step "Android SDK + ARM emulator"
ANDROID_HOME="$HOME/Library/Android/sdk"
CMDLINE_TOOLS="$ANDROID_HOME/cmdline-tools/latest/bin"

# Add to PATH & env
export ANDROID_HOME
export PATH="$CMDLINE_TOOLS:$ANDROID_HOME/platform-tools:$PATH"

if ! grep -q 'ANDROID_HOME' "$SHELL_RC" 2>/dev/null; then
  cat >> "$SHELL_RC" << 'EOF'

# Android SDK
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
EOF
  ok "Android env variables added to $SHELL_RC"
fi

if command -v sdkmanager &>/dev/null; then
  warn "Installing Android SDK packages (arm64 emulator for M3)…"
  yes | sdkmanager --licenses > /dev/null 2>&1 || true
  sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" \
             "system-images;android-34;google_apis;arm64-v8a" \
             "emulator" --sdk_root="$ANDROID_HOME"
  ok "Android SDK packages installed"
  # Create ARM AVD
  if ! avdmanager list avd 2>/dev/null | grep -q 'Pixel_7_M3'; then
    echo "no" | avdmanager create avd \
      --name "Pixel_7_M3" \
      --package "system-images;android-34;google_apis;arm64-v8a" \
      --device "pixel_7" --force
    ok "AVD 'Pixel_7_M3' created (ARM64)"
  fi
else
  warn "sdkmanager not on PATH yet — open Android Studio, install SDK, then re-run this script for AVD creation."
fi

# ── 8. Flutter Android Licenses ───────────────────────────────────────────────
step "Flutter Android licenses"
flutter doctor --android-licenses <<< $'y\ny\ny\ny\ny\n' || true
ok "Android licenses accepted"

# ── 9. CocoaPods ──────────────────────────────────────────────────────────────
step "CocoaPods"
if ! command -v pod &>/dev/null; then
  warn "Installing CocoaPods via Homebrew (arm64 native)…"
  brew install cocoapods
fi
ok "CocoaPods $(pod --version)"

# ── 10. VS Code Extensions ────────────────────────────────────────────────────
step "VS Code Extensions (Flutter + Dart)"
if command -v code &>/dev/null; then
  code --install-extension dart-code.flutter  --force 2>/dev/null || true
  code --install-extension dart-code.dart-code --force 2>/dev/null || true
  ok "VS Code extensions installed"
else
  warn "VS Code CLI 'code' not found — open VS Code → Command Palette → Install 'Flutter' and 'Dart' extensions manually."
fi

# ── 11. Full flutter doctor ───────────────────────────────────────────────────
step "Flutter Doctor (full)"
flutter doctor -v

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Setup complete! Next steps:                 ║${NC}"
echo -e "${GREEN}║  1. source ~/.zshrc                          ║${NC}"
echo -e "${GREEN}║  2. Open Android Studio → SDK Manager        ║${NC}"
echo -e "${GREEN}║     (accept any remaining licenses)          ║${NC}"
echo -e "${GREEN}║  3. Open Xcode → Settings → Platforms        ║${NC}"
echo -e "${GREEN}║     (download iOS 17+ simulator)             ║${NC}"
echo -e "${GREEN}║  4. cd mobile && flutter pub get             ║${NC}"
echo -e "${GREEN}║  5. flutter run                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
