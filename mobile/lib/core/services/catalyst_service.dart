import 'package:flutter/services.dart';
import 'package:logger/logger.dart';
import 'package:zcatalyst_sdk/zcatalyst_sdk.dart';

/// Wrapper around the Zoho Catalyst Flutter SDK v2.x.
///
/// Correct v2.2.4 API:
///  - ZCatalystApp.init()              → initialise SDK
///  - ZCatalystApp.getInstance()       → get singleton
///  - instance.login()                 → WebView sign-in (iOS/Android only)
///  - instance.logout()                → sign out
///  - instance.isUserLoggedIn()        → bool
///  - instance.getCurrentUser()        → (APIResponse, ZCatalystUser)
///  - instance.getDataStoreInstance()  → ZCatalystDataStore
///  - instance.getFunctionInstance()   → ZCatalystFunction
class CatalystService {
  CatalystService._();
  static final CatalystService instance = CatalystService._();

  final _log = Logger(printer: PrettyPrinter(methodCount: 1));

  bool _initialised = false;
  bool get isInitialised => _initialised;

  ZCatalystApp get _sdk => ZCatalystApp.getInstance();

  // ── Initialise ─────────────────────────────────────────────────────────────
  /// Call once in main() before runApp.
  ///
  /// Uses the `catalyst-app.properties` file bundled in the native project.
  /// On web/unsupported platforms the SDK is unavailable — auth falls back
  /// to the HTTP session cookie flow instead.
  Future<void> initialise() async {
    if (_initialised) return;
    try {
      await ZCatalystApp.init(
        environment: ZCatalystEnvironment.DEVELOPMENT,
      );
      _initialised = true;
      _log.i('Catalyst SDK initialised (properties file)');
    } on MissingPluginException {
      // Web or platform without native plugin — skip SDK init.
      // Auth will use direct HTTP cookie session instead.
      _log.w('Catalyst SDK not available on this platform (web?). '
          'Auth via HTTP cookie session will be used.');
      _initialised = false;
    } catch (e, st) {
      _log.e('Catalyst SDK init error', error: e, stackTrace: st);
      _initialised = false;
    }
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /// Opens Catalyst OAuth WebView login (iOS/Android only).
  Future<bool> signIn() async {
    if (!_initialised) {
      _log.w('signIn: SDK not initialised');
      return false;
    }
    try {
      _log.i('signIn: calling _sdk.login()...');
      await _sdk.login();
      _log.i('signIn: login() completed, checking isUserLoggedIn...');
      final authenticated = await isUserAuthenticated();
      _log.i('signIn: isUserAuthenticated = $authenticated');
      return authenticated;
    } on MissingPluginException {
      _log.w('login() not supported on this platform');
      return false;
    } catch (e, st) {
      _log.e('signIn failed', error: e, stackTrace: st);
      return false;
    }
  }

  /// Sign out the current user.
  Future<void> signOut() async {
    if (!_initialised) return;
    try {
      await _sdk.logout();
      _log.i('User signed out');
    } catch (e) {
      _log.e('signOut error', error: e);
    }
  }

  /// Returns true when the user has an active Catalyst session.
  Future<bool> isUserAuthenticated() async {
    if (!_initialised) return false;
    try {
      return await _sdk.isUserLoggedIn();
    } catch (_) {
      return false;
    }
  }

  /// Returns the logged-in Catalyst user, or null on error.
  Future<ZCatalystUser?> getCurrentUser() async {
    if (!_initialised) return null;
    try {
      final (_, user) = await _sdk.getCurrentUser();
      return user;
    } catch (e) {
      _log.e('getCurrentUser error', error: e);
      return null;
    }
  }

  /// Returns the access token for use in Authorization headers.
  Future<String?> getAccessToken() async {
    if (!_initialised) return null;
    try {
      return await _sdk.getAccessToken();
    } catch (_) {
      return null;
    }
  }

  // ── Push Notifications ─────────────────────────────────────────────────────

  /// Registers a device push token with Catalyst Notification Service.
  /// Call this after the user signs in and a token has been obtained.
  Future<void> registerNotification({
    required String deviceToken,
    required String notificationAppId,
    bool isTestDevice = false,
  }) async {
    if (!_initialised) return;
    try {
      await _sdk.registerNotification(deviceToken, notificationAppId, isTestDevice);
      _log.i('Push notification registered');
    } catch (e) {
      _log.e('registerNotification error', error: e);
    }
  }

  /// Deregisters the device from Catalyst push notifications (call on sign-out).
  Future<void> deregisterNotification({
    required String deviceToken,
    required String notificationAppId,
  }) async {
    if (!_initialised) return;
    try {
      await _sdk.deregisterNotification(deviceToken, notificationAppId, false);
      _log.i('Push notification deregistered');
    } catch (e) {
      _log.e('deregisterNotification error', error: e);
    }
  }

  // ── Data Store ─────────────────────────────────────────────────────────────

  ZCatalystDataStore get dataStore => _sdk.getDataStoreInstance();

  // ── Functions ──────────────────────────────────────────────────────────────

  ZCatalystFunction function(String identifier) =>
      _sdk.getFunctionInstance(identifier: identifier);
}
