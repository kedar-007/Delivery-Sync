import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:logger/logger.dart';

import '../constants/app_constants.dart';
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

  void _onNotificationTap(NotificationResponse response) {
    _log.d('Notification tapped: ${response.payload}');
    // TODO: navigate based on payload
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
