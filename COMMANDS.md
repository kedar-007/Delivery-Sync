# Delivery Sync — Developer Commands

## iOS Simulator (iPhone 17 Pro — iOS 26.4)

```zsh
# ── Quick run (simulator already booted) ────────────────────────────────────
cd /Users/kedar/Documents/C-DS/mobile && flutter run -d 96AAF330-B522-45E5-BB8D-078242F961A4

# ── Boot simulator first, then run ──────────────────────────────────────────
xcrun simctl boot "iPhone 17 Pro" && open -a Simulator
cd /Users/kedar/Documents/C-DS/mobile && flutter run -d 96AAF330-B522-45E5-BB8D-078242F961A4

# ── Full reset (after flutter clean or fresh checkout) ───────────────────────
cd /Users/kedar/Documents/C-DS/mobile && flutter pub get && cd ios && pod install && cd .. && flutter run -d 96AAF330-B522-45E5-BB8D-078242F961A4

# ── Utility ──────────────────────────────────────────────────────────────────
xcrun simctl list devices available | grep "iPhone 17"   # list simulators
flutter devices                                          # confirm device ID
```

## Android Emulator

```zsh
# ── Quick run (emulator already running) ────────────────────────────────────
cd /Users/kedar/Documents/C-DS/mobile && flutter run -d android

# ── Start emulator, then run ─────────────────────────────────────────────────
emulator -avd <avd_name> &
cd /Users/kedar/Documents/C-DS/mobile && flutter run -d android

# ── Run on a specific emulator ID ────────────────────────────────────────────
flutter devices                        # get emulator ID
cd /Users/kedar/Documents/C-DS/mobile && flutter run -d <emulator-id>

# ── Utility ──────────────────────────────────────────────────────────────────
emulator -list-avds                    # list available AVDs
```

## Run Both Simultaneously

```zsh
# Terminal 1 — iOS
cd /Users/kedar/Documents/C-DS/mobile && flutter run -d 96AAF330-B522-45E5-BB8D-078242F961A4

# Terminal 2 — Android
cd /Users/kedar/Documents/C-DS/mobile && flutter run -d android
```

## Build Mobile Apps

```bash
cd mobile

# ── Android ─────────────────────────────────────────────────────────────────

# Build release APK (installs via sideload)
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk

# Copy APK to Desktop for easy access
cp build/app/outputs/flutter-apk/app-release.apk ~/Desktop/DeliverySync-$(date +%Y%m%d).apk

# Build App Bundle (for Play Store)
flutter build appbundle --release

# ── iOS ──────────────────────────────────────────────────────────────────────

# Build unsigned iOS archive (no Apple Developer cert needed)
flutter build ios --release --no-codesign

# Build for simulator only
flutter build ios --simulator

# ── Clean + Rebuild ──────────────────────────────────────────────────────────

flutter clean && flutter pub get && flutter build apk --release
```

## Run Web Frontend

```bash
cd frontend

# Start dev server (hot reload)
npm start
# Opens at http://localhost:3000

# Build for production
npm run build

# Serve production build locally
npx serve -s build
```

## Flutter Utilities

```bash
cd mobile

# Check connected devices / emulators
flutter devices

# Check Flutter environment
flutter doctor

# Get/update dependencies
flutter pub get

# Run with verbose logging
flutter run --verbose

# Hot reload (while app is running): press r
# Hot restart: press R
# Quit: press q
```

## Remove Old Builds

```bash
# Remove old APKs from Desktop
rm -f ~/Desktop/DeliverySync-*.apk

# Clean Flutter build cache
cd mobile && flutter clean
```
