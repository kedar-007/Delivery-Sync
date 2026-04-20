import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {

  private var deviceToken: String?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Register for remote (APNs) notifications
    UNUserNotificationCenter.current().delegate = self
    application.registerForRemoteNotifications()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    // pluginRegistry is FlutterEngine in Flutter 3.x, not FlutterViewController
    let messenger: FlutterBinaryMessenger
    if let engine = engineBridge.pluginRegistry as? FlutterEngine {
      messenger = engine.binaryMessenger
    } else if let vc = engineBridge.pluginRegistry as? FlutterViewController {
      messenger = vc.binaryMessenger
    } else {
      return
    }
    let channel = FlutterMethodChannel(
      name: "ds/notifications",
      binaryMessenger: messenger
    )
    channel.setMethodCallHandler { [weak self] call, result in
      if call.method == "getDeviceToken" {
        result(self?.deviceToken)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }
  }

  // APNs token received — convert bytes to hex string
  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let tokenString = deviceToken.map { String(format: "%02x", $0) }.joined()
    self.deviceToken = tokenString
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    print("[DS] APNs registration failed: \(error.localizedDescription)")
  }
}
