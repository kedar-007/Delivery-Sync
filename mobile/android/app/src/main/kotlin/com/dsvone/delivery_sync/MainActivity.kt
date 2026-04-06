package com.dsvone.delivery_sync

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val CHANNEL = "ds/notifications"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "getDeviceToken") {
                    // Returns null until google-services.json + FCM are configured
                    // Push notifications work via Catalyst once FCM is set up
                    result.success(null)
                } else {
                    result.notImplemented()
                }
            }
    }
}
