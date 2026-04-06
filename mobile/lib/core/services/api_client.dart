import 'package:dio/dio.dart';
import 'package:logger/logger.dart';

import '../constants/app_constants.dart';
import 'token_manager.dart';

/// Central Dio HTTP client for all Catalyst Function API calls.
///
/// Automatically injects `Authorization: Zoho-oauthtoken <token>` on every
/// request using the token stored by [TokenManager] after sign-in.
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
    final response = await _dio.get(path, queryParameters: queryParameters);
    return _parse(response.data, fromJson);
  }

  Future<T> post<T>(
    String path, {
    dynamic data,
    T Function(dynamic)? fromJson,
  }) async {
    final response = await _dio.post(path, data: data);
    return _parse(response.data, fromJson);
  }

  Future<T> put<T>(
    String path, {
    dynamic data,
    T Function(dynamic)? fromJson,
  }) async {
    final response = await _dio.put(path, data: data);
    return _parse(response.data, fromJson);
  }

  Future<T> patch<T>(
    String path, {
    dynamic data,
    T Function(dynamic)? fromJson,
  }) async {
    final response = await _dio.patch(path, data: data);
    return _parse(response.data, fromJson);
  }

  Future<void> delete(String path) async {
    await _dio.delete(path);
  }

  T _parse<T>(dynamic raw, T Function(dynamic)? fromJson) {
    if (fromJson != null) return fromJson(raw);
    return raw as T;
  }
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
