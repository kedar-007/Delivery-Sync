import 'package:dio/dio.dart';
import 'package:logger/logger.dart';

import '../constants/app_constants.dart';
import 'token_manager.dart';

/// User-facing API error. Carries a humanised [message] (safe to display in
/// snackbars / dialogs), the HTTP [statusCode] when known, and the raw
/// response payload for diagnostic logs. `toString()` returns just the
/// human message so legacy `'$e'` formatters in screens automatically yield
/// friendly text without per-site changes.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.raw});

  /// Short, user-friendly sentence — never includes URLs, stack traces or
  /// raw backend payloads.
  final String message;

  /// HTTP status when available. `null` for network / cancellation errors.
  final int? statusCode;

  /// Original Dio response data for logging.
  final dynamic raw;

  @override
  String toString() => message;
}

/// Central Dio HTTP client for all Catalyst Function API calls.
///
/// Automatically injects `Authorization: Zoho-oauthtoken <token>` on every
/// request using the token stored by [TokenManager] after sign-in. Every
/// helper method converts low-level [DioException]s into [ApiException]
/// with a humanised message so the UI layer doesn't have to format URLs,
/// status codes or stack traces out of `'$e'` interpolations.
class ApiClient {
  ApiClient._() {
    _init();
  }
  static final ApiClient instance = ApiClient._();

  final _log = Logger(printer: SimplePrinter());
  late final Dio _dio;

  void _init() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConstants.catalystProjectDomain,
      connectTimeout: AppConstants.connectTimeout,
      receiveTimeout: AppConstants.receiveTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    // Inject Zoho OAuth token on every request
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = TokenManager.instance.token;
        if (token != null) {
          options.headers['Authorization'] = 'Zoho-oauthtoken $token';
        }
        return handler.next(options);
      },
    ));

    _dio.interceptors.add(_LogInterceptor(_log));
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.get(path, queryParameters: queryParameters);
      return _parse(response.data, fromJson);
    } on DioException catch (e) {
      throw _humanize(e);
    }
  }

  Future<T> post<T>(
    String path, {
    dynamic data,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.post(path, data: data);
      return _parse(response.data, fromJson);
    } on DioException catch (e) {
      throw _humanize(e);
    }
  }

  Future<T> put<T>(
    String path, {
    dynamic data,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.put(path, data: data);
      return _parse(response.data, fromJson);
    } on DioException catch (e) {
      throw _humanize(e);
    }
  }

  Future<T> patch<T>(
    String path, {
    dynamic data,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.patch(path, data: data);
      return _parse(response.data, fromJson);
    } on DioException catch (e) {
      throw _humanize(e);
    }
  }

  Future<void> delete(String path) async {
    try {
      await _dio.delete(path);
    } on DioException catch (e) {
      throw _humanize(e);
    }
  }

  T _parse<T>(dynamic raw, T Function(dynamic)? fromJson) {
    if (fromJson != null) return fromJson(raw);
    return raw as T;
  }

  /// Convert a low-level Dio failure into an [ApiException] whose `message`
  /// is something we'd be happy to show in a snackbar.
  ///
  /// Resolution order:
  ///   1. Backend `ResponseHelper` payload → `data.message` (preferred)
  ///   2. Plain-text `data` body (some Catalyst error pages)
  ///   3. Friendly fallback by HTTP status code
  ///   4. Generic network / timeout messages by `DioExceptionType`
  ///
  /// Raw URLs, stack traces and Catalyst correlation IDs are never included.
  ApiException _humanize(DioException e) {
    final res    = e.response;
    final status = res?.statusCode;
    final raw    = res?.data;

    // 1. Backend JSON: { success: false, message: '...' }
    String? backendMsg;
    if (raw is Map) {
      final m = raw['message'] ?? raw['error']?['message'] ?? raw['error'];
      if (m is String && m.trim().isNotEmpty) backendMsg = m.trim();
    } else if (raw is String) {
      final trimmed = raw.trim();
      // Skip HTML error pages and giant payloads — fall through to status-code
      // fallback in those cases so we don't show "<html>…" in the UI.
      if (trimmed.isNotEmpty &&
          !trimmed.startsWith('<') &&
          trimmed.length < 250) {
        backendMsg = trimmed;
      }
    }
    if (backendMsg != null) {
      return ApiException(backendMsg, statusCode: status, raw: raw);
    }

    // 2. HTTP status-based fallback
    if (status != null) {
      final msg = switch (status) {
        400 => 'Some required information is missing or invalid.',
        401 => 'Your session has expired. Please sign in again.',
        403 => "You don't have permission to perform this action.",
        404 => 'We couldn\'t find what you were looking for.',
        409 => 'That conflicts with an existing item.',
        413 => 'The file or request is too large.',
        422 => 'Some required information is missing or invalid.',
        429 => 'Too many requests — please wait a moment and try again.',
        >= 500 && < 600 => 'Server error — please try again in a few moments.',
        _   => 'Request failed (status $status).',
      };
      return ApiException(msg, statusCode: status, raw: raw);
    }

    // 3. Transport-level errors (no HTTP response at all)
    final msg = switch (e.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout       ||
      DioExceptionType.receiveTimeout    =>
        'The server took too long to respond. Please check your connection and try again.',
      DioExceptionType.connectionError =>
        'Can\'t reach the server. Please check your internet connection.',
      DioExceptionType.cancel    => 'Request was cancelled.',
      DioExceptionType.badCertificate =>
        'Secure connection failed. Please try again later.',
      _ => 'Something went wrong. Please try again.',
    };
    return ApiException(msg, statusCode: null, raw: raw);
  }
}

/// Public, callable shape of [ApiClient._humanize] — used by code that
/// catches a non-ApiException error (e.g. JSON parse failures inside a
/// provider) and wants the same friendly formatting. Falls back to
/// `error.toString()` when nothing else applies.
String humanizeError(Object error) {
  if (error is ApiException) return error.message;
  final s = error.toString();
  // Strip the redundant "Exception: " prefix Dart adds.
  if (s.startsWith('Exception: ')) return s.substring(11);
  return s;
}

/// Logs full request / response for debugging.
class _LogInterceptor extends Interceptor {
  _LogInterceptor(this._log);
  final Logger _log;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    _log.d(
      '→ ${options.method} ${options.baseUrl}${options.path}\n'
      '  Headers: ${options.headers}\n'
      '  Body: ${options.data}',
    );
    super.onRequest(options, handler);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    _log.d(
      '← ${response.statusCode} ${response.requestOptions.path}\n'
      '  Response: ${response.data}',
    );
    super.onResponse(response, handler);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _log.e(
      '✖ ${err.requestOptions.method} ${err.requestOptions.path}\n'
      '  Status: ${err.response?.statusCode}\n'
      '  Error: ${err.message}\n'
      '  Response: ${err.response?.data}',
    );
    super.onError(err, handler);
  }
}
