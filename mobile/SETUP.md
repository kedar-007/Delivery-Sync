# Delivery Sync Mobile — Setup Guide

## Step 1 — Run the Mac setup script (first time only)

```bash
cd /Users/kedar/Documents/C-DS
chmod +x mobile_setup.sh
./mobile_setup.sh
source ~/.zshrc
```

> The script installs: Flutter, Android Studio, Android SDK (ARM64 emulator for M3),
> Xcode CLI, CocoaPods, VS Code extensions, Homebrew, Git, Node.js

---

## Step 2 — Configure Catalyst credentials

Open `lib/core/constants/app_constants.dart` and fill in:

```dart
static const String catalystProjectId   = 'YOUR_CATALYST_PROJECT_ID';
static const String catalystProjectKey  = 'YOUR_CATALYST_PROJECT_KEY';
static const String catalystProjectDomain = 'https://dsv-one.com';
```

Find your Project ID + Key in:
**Zoho Catalyst Console → Your Project → Settings → Project Credentials**

---

## Step 3 — Install Flutter dependencies

```bash
cd mobile
flutter pub get
```

---

## Step 4 — Install iOS pods

```bash
cd ios
pod install
cd ..
```

---

## Step 5 — Run flutter doctor (verify all green)

```bash
flutter doctor -v
```

Expected output (M3 Mac):
```
[✓] Flutter
[✓] Android toolchain
[✓] Xcode
[✓] Chrome (optional)
[✓] Android Studio
[✓] VS Code
[✓] Connected device
```

---

## Step 6 — Run the app

### iOS Simulator
```bash
open -a Simulator
flutter run -d iPhone   # or: flutter devices → pick simulator
```

### Android Emulator (ARM64 for M3)
```bash
emulator -avd Pixel_7_M3 &
flutter run -d emulator
```

### Physical device
```bash
flutter devices
flutter run -d <device-id>
```

---

## Project Structure

```
mobile/
├── lib/
│   ├── main.dart                    ← App entry, Catalyst SDK init
│   ├── app.dart                     ← MaterialApp, router setup
│   ├── core/
│   │   ├── constants/app_constants.dart   ← Catalyst config, API paths, roles
│   │   ├── theme/                         ← Dark theme, DS brand colours
│   │   ├── router/app_router.dart         ← go_router, auth redirect
│   │   └── services/
│   │       ├── catalyst_service.dart      ← Zoho Catalyst SDK wrapper
│   │       └── api_client.dart            ← Dio HTTP client
│   ├── features/
│   │   ├── auth/          ← Login screen + auth state (Riverpod)
│   │   ├── dashboard/     ← Home screen, metrics, project list, my tasks
│   │   ├── projects/      ← Projects list + create modal
│   │   ├── sprints/       ← My tasks, board, backlog tabs
│   │   ├── standup/       ← Daily stand-up submission form
│   │   ├── people/        ← Directory, org chart, leave
│   │   ├── profile/       ← User profile, settings, sign out
│   │   └── shell/         ← Bottom nav shell
│   └── shared/
│       ├── models/models.dart   ← All data models
│       └── widgets/             ← DsMetricCard, RagBadge, PriorityBadge, etc.
├── pubspec.yaml
└── mobile_setup.sh              ← Mac M3 one-shot setup script
```

---

## Key Architecture Decisions

| Concern | Choice | Reason |
|---------|--------|--------|
| State management | **Riverpod** | Type-safe, composable, testable |
| Navigation | **go_router** | Deep linking, shell routes, redirect |
| HTTP | **Dio + cookie_jar** | Catalyst session cookies auto-propagated |
| Auth | **Zoho Catalyst SDK** (zcatalyst_sdk) | Native SSO, embedded WebView |
| Theme | **Dark-first** | Matches web app DS brand |

---

## Authentication Flow

```
App starts → CatalystService.initialize()
           → AuthNotifier.checkAuth()
           → isUserAuthenticated() [Catalyst SDK]
           ├── YES → GET /auth/me → set CurrentUser → navigate /home
           └── NO  → navigate /login
                    → user taps "Sign In"
                    → catalyst.auth.signIn(context) [WebView OAuth]
                    → isUserAuthenticated() → GET /auth/me → /home
```

---

## Adding a new feature

1. Create `lib/features/<name>/providers/<name>_provider.dart`
2. Create `lib/features/<name>/presentation/screens/<name>_screen.dart`
3. Add route in `lib/core/router/app_router.dart`
4. Add to bottom nav in `lib/features/shell/presentation/screens/shell_screen.dart`

---

## Build for release

```bash
# Android APK
flutter build apk --release

# Android AAB (Play Store)
flutter build appbundle --release

# iOS
flutter build ios --release
# Then open ios/Runner.xcworkspace in Xcode → Archive
```
