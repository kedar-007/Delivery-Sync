# Catalyst MDM — Deploy Checklist

End-to-end steps to publish a new release of the DSV OpsPulse mobile app via
Zoho Catalyst MDM. Pairs with `scripts/build_release.sh` which produces the
signed artifacts this checklist uploads.

> **Environment:** make sure the Catalyst console is set to **Production**
> before clicking Upload. Apps uploaded to Development don't go live.

---

## 1. One-time setup (do once per project)

### 1a. Enable MDM
1. Catalyst console → **Add-on Services → Mobile Device Management** → **Enable Now**.
2. Confirm. MDM cannot be disabled afterwards.

### 1b. Android signing (one-time)
1. Generate an Android upload keystore:
   ```bash
   keytool -genkey -v -keystore ~/.dsv-opspulse-upload.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. Create `mobile/android/key.properties`:
   ```properties
   storePassword=...
   keyPassword=...
   keyAlias=upload
   storeFile=/Users/<you>/.dsv-opspulse-upload.jks
   ```
3. Make sure `android/app/build.gradle` references this file in its
   `signingConfigs.release` block (already wired by Flutter scaffold).
4. **Back up the keystore offline.** Losing it means you can't ship updates
   to existing installs — Google rejects mismatched signatures.

### 1c. iOS APNs certificate (one-time, required for push notifications)
1. From Catalyst console → MDM → **iOS** → **Create APNs**. Download the
   *Vendor Signed CSR* file.
2. Upload that CSR to the
   [Apple Push Certificates Portal](https://identity.apple.com/pweb/).
3. Apple gives you a `.cer` file. Convert it to `.p12` on a Mac:
   - Double-click the `.cer` → it installs into Keychain Access.
   - Locate the certificate under *Certificates*, expand the arrow to expose
     the private key, select both.
   - **File → Export Items…** → format `.p12` → set a password (save it).
4. Back in Catalyst MDM → upload the `.p12`, enter the corporate Apple ID,
   the password, and an email for expiry notices.

### 1d. iOS signing (one-time)
1. Apple Developer Program membership required.
2. Open `mobile/ios/Runner.xcworkspace` in Xcode.
3. Signing & Capabilities tab → set Team, Bundle ID
   (`com.dsv.opspulse` or similar), enable automatic signing.
4. Make sure Push Notifications and Background Modes → Remote Notifications
   capabilities are enabled.

---

## 2. Per-release deploy (the recurring part)

### Step 1 — Bump version
Edit `mobile/pubspec.yaml`:
```yaml
version: 1.2.0+15   # ←  <semver>+<buildNumber>
```
Increment **buildNumber** on every upload (Catalyst MDM rejects duplicates).

### Step 2 — Build signed artifacts
```bash
cd mobile
./scripts/build_release.sh both     # or: android | ios
```
Output:
- `build/app/outputs/flutter-apk/app-release.apk`
- `build/ios/ipa/delivery_sync.ipa`

### Step 3 — Prepare assets
- App logo: 1024×1024 PNG → resize to ≤ 50 KB **JPEG**, square crop.
  - macOS quick recipe: `sips -s format jpeg -Z 512 -s formatOptions 60 logo.png --out logo.jpg`
- Release notes — one paragraph describing what changed. Keep under 500 chars.

### Step 4 — Upload Android (.apk)
1. Catalyst console → MDM → **Android** tab → **Upload** (first time) or
   **Update App** (subsequent uploads).
2. Fill in: App Name, Platform = Android, APK file, logo (.jpeg), description.
3. Crop logo when prompted → **Crop** → **Upload**.
4. Wait for the console to confirm "Hosted Live" — usually under a minute.

### Step 5 — Upload iOS (.ipa)
1. Catalyst console → MDM → **iOS** tab → **Update App**.
2. Same fields. The APNs setup from step 1c is already in place so skip the
   CSR step on updates.
3. Upload → wait for "Hosted Live".

### Step 6 — Smoke test on a real device
**Don't trust the simulator for push notifications.** Test on a real device:
1. From the *Invites* tab in MDM, invite a test user (your own email).
2. Open the email on the phone → accept invite → install the MDM cert when
   prompted → app installs automatically.
3. Verify:
   - Login works
   - Push permission prompt appears
   - Send yourself a notification (assign yourself a task in the web app)
   - **Tap the notification — it should jump to the specific task.** This is
     the deep-link flow we wired up in `notification_service.dart`.

### Step 7 — Roll out to org
From MDM → Invites tab → **Invite Users**:
- Select service (Zoho CRM or Zoho Desk) — pulls your org's user list.
- Pick the platform (Android / iOS).
- Click **Send Invite**. Users get an email + ManageEngine MDM enrolment.

---

## 3. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Build with same version already exists" | Forgot to bump `buildNumber` in pubspec | Increment, rebuild, re-upload |
| iOS push tokens never arrive | APNs cert expired or wrong env (sandbox vs prod) | Re-issue APNs cert from Apple, re-upload to Catalyst |
| Tap on notification opens app but doesn't navigate | Notification payload missing `entityType` / `entityId` | Backend's `sendInApp()` must include both — already wired in the controllers we touched |
| Android install blocked with "Untrusted developer" | ManageEngine MDM cert not yet trusted | Settings → General → VPN & Device Management → trust the MDM profile |
| iOS install shows "Untrusted enterprise developer" | Same as above on iOS | Settings → General → VPN & Device Management → trust the certificate |
| Older version still on the device | Catalyst hasn't pushed the update via MDM yet | Wait 5–10 min, or pull-to-refresh in the MDM agent app |

---

## 4. What changes per release

99% of the time you only do:
1. Bump version in `pubspec.yaml`
2. `./scripts/build_release.sh both`
3. Upload .apk + .ipa via console
4. Smoke test
5. Done

The one-time setup at the top is for the very first push only.
