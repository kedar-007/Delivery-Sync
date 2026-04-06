import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:logger/logger.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/services/api_client.dart';
import '../../../core/services/catalyst_service.dart';
import '../../../core/services/notification_service.dart';
import '../../../core/services/token_manager.dart';
import '../../../shared/models/models.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

final currentUserProvider = Provider<CurrentUser?>((ref) {
  return ref.watch(authProvider).user;
});

final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authProvider).status == AuthStatus.authenticated;
});

// ── State ─────────────────────────────────────────────────────────────────────

enum AuthStatus { initial, checking, authenticated, unauthenticated, error }

class AuthState {
  const AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.errorMessage,
  });

  final AuthStatus status;
  final CurrentUser? user;
  final String? errorMessage;

  bool get isLoading => status == AuthStatus.checking;

  AuthState copyWith({
    AuthStatus? status,
    CurrentUser? user,
    String? errorMessage,
  }) => AuthState(
    status: status ?? this.status,
    user: user ?? this.user,
    errorMessage: errorMessage ?? this.errorMessage,
  );
}

// ── Notifier ──────────────────────────────────────────────────────────────────

class AuthNotifier extends Notifier<AuthState> {
  static const _storage = FlutterSecureStorage();
  static const _apiPath = '${AppConstants.baseCore}/auth/me';
  final _log = Logger(printer: SimplePrinter());

  @override
  AuthState build() => const AuthState();

  /// Called once at app startup to restore the previous session.
  Future<void> checkAuth() async {
    state = state.copyWith(status: AuthStatus.checking);
    final authenticated = await CatalystService.instance.isUserAuthenticated();
    if (authenticated) {
      await _fetchAndSetUser();
    } else {
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  /// Triggers the Catalyst OAuth WebView sign-in (iOS/Android).
  Future<bool> signIn() async {
    // Catalyst SDK only supports iOS and Android
    final supported = Platform.isIOS || Platform.isAndroid;
    if (!supported) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        errorMessage: 'Sign-in requires an iOS or Android device. '
            'macOS/desktop is not supported by the Zoho Catalyst SDK.',
      );
      return false;
    }
    state = state.copyWith(status: AuthStatus.checking);
    final success = await CatalystService.instance.signIn();
    if (success) {
      await _fetchAndSetUser();
      return true;
    }
    state = state.copyWith(
      status: AuthStatus.unauthenticated,
      errorMessage: 'Sign-in failed. Please try again.',
    );
    return false;
  }

  Future<void> signOut() async {
    await NotificationService.instance.deregister();
    await CatalystService.instance.signOut();
    await _storage.deleteAll();
    await TokenManager.instance.clearToken();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> _fetchAndSetUser() async {
    try {
      // Fetch and store the Zoho OAuth access token for API calls
      final accessToken = await CatalystService.instance.getAccessToken();
      _log.i('Access token obtained: ${accessToken != null ? "YES (${accessToken.substring(0, 20)}...)" : "NULL"}');
      if (accessToken != null) {
        await TokenManager.instance.setToken(accessToken);
      }

      _log.i('Calling API: $_apiPath');
      final data = await ApiClient.instance.get<Map<String, dynamic>>(
        _apiPath,
        fromJson: (raw) => raw as Map<String, dynamic>,
      );
      _log.i('API response: $data');
      // API returns { success, data: { user: { id, email, name, ... } } }
      final dataField = data['data'];
      final Map<String, dynamic> userJson;
      if (dataField is Map && dataField['user'] is Map) {
        userJson = Map<String, dynamic>.from(dataField['user'] as Map);
      } else if (dataField is Map) {
        userJson = Map<String, dynamic>.from(dataField);
      } else {
        userJson = Map<String, dynamic>.from(data);
      }
      final user = CurrentUser.fromJson(userJson);
      _log.i('User loaded: ${user.name} | role: ${user.role}');

      // Cache tenant slug and role for fast access
      await _storage.write(key: AppConstants.keyTenantSlug, value: user.tenantSlug ?? '');
      await _storage.write(key: AppConstants.keyUserRole,   value: user.role);
      await _storage.write(key: AppConstants.keyUserId,     value: user.id);

      state = state.copyWith(status: AuthStatus.authenticated, user: user);

      // Register device for Catalyst push notifications
      await NotificationService.instance.requestPermissions();
      await NotificationService.instance.init();
    } catch (e, st) {
      _log.e('_fetchAndSetUser failed: $e\n$st');
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Failed to load user profile: $e',
      );
    }
  }
}
