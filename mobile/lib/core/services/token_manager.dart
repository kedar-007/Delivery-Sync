import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores the Zoho OAuth access token in memory (fast) and secure storage
/// (persists across restarts). Updated after every successful sign-in.
class TokenManager {
  TokenManager._internal();
  static final TokenManager _instance = TokenManager._internal();
  static TokenManager get instance => _instance;

  String? _accessToken;
  String? get token => _accessToken;

  static const _key = 'ds_access_token';

  final _storage = const FlutterSecureStorage();

  /// Load token from secure storage into memory (call once at startup).
  Future<void> loadToken() async {
    _accessToken = await _storage.read(key: _key);
  }

  /// Persist a new token to memory and secure storage.
  Future<void> setToken(String token) async {
    _accessToken = token;
    await _storage.write(key: _key, value: token);
  }

  /// Clear token on sign-out.
  Future<void> clearToken() async {
    _accessToken = null;
    await _storage.delete(key: _key);
  }
}
