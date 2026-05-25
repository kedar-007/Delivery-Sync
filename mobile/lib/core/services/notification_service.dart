import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import 'package:logger/logger.dart';

import '../constants/app_constants.dart';
import '../router/app_router.dart';
import '../router/notification_routes.dart';
import 'catalyst_service.dart';

/// Zoho Catalyst Push Notification Service.
///
/// Architecture (no Firebase Flutter packages):
///  - iOS  : AppDelegate.swift requests APNs permission and exposes the token
///            via the "ds/notifications" MethodChannel.
///  - Android: MainActivity.kt retrieves the FCM token via the native
///             Firebase Android SDK and exposes it via the same channel.
///  - Flutter: This service reads the token, registers it with the Catalyst
///             Push Notification API, and handles display via
///             flutter_local_notifications.
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final _log = Logger(printer: SimplePrinter());
  final _plugin = FlutterLocalNotificationsPlugin();

  // MethodChannel used by native side to push device tokens up to Dart.
  static const _channel = MethodChannel('ds/notifications');

  // ── Initialise ─────────────────────────────────────────────────────────────

  /// Call once after the Catalyst SDK is initialised and the user is signed in.
  Future<void> init() async {
    await _initLocalNotifications();
    await _registerWithCatalyst();
  }

  Future<void> _initLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _plugin.initialize(
      settings: const InitializationSettings(android: androidSettings, iOS: iosSettings),
      onDidReceiveNotificationResponse: _onNotificationTap,
    );
  }

  Future<void> _registerWithCatalyst() async {
    try {
      final token = await _getDeviceToken();
      if (token == null || token.isEmpty) {
        _log.w('Push token unavailable — skipping Catalyst registration');
        return;
      }
      _log.d('Device push token: $token');
      await CatalystService.instance.registerNotification(
        deviceToken: token,
        notificationAppId: AppConstants.notificationAppId,
        isTestDevice: false,
      );
    } catch (e) {
      _log.e('Push notification registration failed', error: e);
    }
  }

  /// Deregister on sign-out.
  Future<void> deregister() async {
    try {
      final token = await _getDeviceToken();
      if (token == null || token.isEmpty) return;
      await CatalystService.instance.deregisterNotification(
        deviceToken: token,
        notificationAppId: AppConstants.notificationAppId,
      );
    } catch (e) {
      _log.e('Push deregistration failed', error: e);
    }
  }

  // ── Token retrieval via MethodChannel ──────────────────────────────────────

  Future<String?> _getDeviceToken() async {
    try {
      final token = await _channel.invokeMethod<String>('getDeviceToken');
      return token;
    } on MissingPluginException {
      _log.w('Native push token channel not implemented on this platform');
      return null;
    } catch (e) {
      _log.e('Error getting device token', error: e);
      return null;
    }
  }

  // ── Display local notification ─────────────────────────────────────────────

  Future<void> show({
    required String title,
    required String body,
    String? payload,
    int id = 0,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'ds_main_channel',
      'Delivery Sync',
      channelDescription: 'Delivery Sync notifications',
      importance: Importance.high,
      priority: Priority.high,
    );
    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );
    await _plugin.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(android: androidDetails, iOS: iosDetails),
      payload: payload,
    );
  }

  /// Build the JSON payload for a notification — encoded into the OS
  /// notification's `payload` field and parsed back by [_onNotificationTap]
  /// when the user taps the OS banner / notification-centre entry.
  ///
  /// Backend callers should already populate these fields; the helper exists
  /// so the notification list inside the app can deep-link the same way as
  /// a push tap (same code path, same destination).
  static String encodePayload({
    String? entityType,
    String? entityId,
    Map<String, dynamic>? metadata,
  }) =>
      jsonEncode({
        if (entityType != null) 'entityType': entityType,
        if (entityId   != null) 'entityId':   entityId,
        if (metadata   != null) 'metadata':   metadata,
      });

  /// Navigate to the specific record a notification points at. Safe to call
  /// from non-widget code — uses the [rootNavigatorKey] attached to GoRouter.
  ///
  /// The same logic lives in the web app's NotificationBell — keeping both
  /// sides in sync means a notification opened on phone vs. browser lands on
  /// the same record either way.
  void openForEntity({
    required String? entityType,
    required String? entityId,
    Map<String, dynamic>? metadata,
  }) {
    final route = notificationRoute(
      entityType: entityType,
      entityId: entityId,
      metadata: metadata,
    );
    if (route == null) return;

    final ctx = rootNavigatorKey.currentContext;
    if (ctx == null) {
      _log.w('Notification tap: rootNavigatorKey has no context yet, skipping nav');
      return;
    }
    final uri = Uri(path: route.path, queryParameters: route.queryParameters);
    try {
      ctx.go(uri.toString());
    } catch (e) {
      _log.e('Notification navigation failed', error: e);
    }
  }

  void _onNotificationTap(NotificationResponse response) {
    final payload = response.payload;
    _log.d('Notification tapped: $payload');
    if (payload == null || payload.isEmpty) return;
    try {
      final decoded = jsonDecode(payload) as Map<String, dynamic>;
      openForEntity(
        entityType: decoded['entityType'] as String?,
        entityId:   decoded['entityId'] as String?,
        metadata:   decoded['metadata'] is Map
            ? Map<String, dynamic>.from(decoded['metadata'] as Map)
            : null,
      );
    } catch (e) {
      _log.w('Could not parse notification payload as JSON: $payload');
    }
  }

  // ── Request permissions explicitly (call after login) ─────────────────────

  Future<void> requestPermissions() async {
    if (Platform.isIOS) {
      await _plugin
          .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(alert: true, badge: true, sound: true);
    } else if (Platform.isAndroid) {
      await _plugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
    }
  }
}
