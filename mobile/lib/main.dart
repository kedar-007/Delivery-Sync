import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/services/catalyst_service.dart';
import 'core/services/token_manager.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Enforce portrait by default (can be overridden per screen)
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Transparent status bar
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Colors.transparent,
  ));

  // Initialise Zoho Catalyst SDK
  await CatalystService.instance.initialise();

  // Load cached access token from secure storage
  await TokenManager.instance.loadToken();

  runApp(
    const ProviderScope(
      child: DeliverySyncApp(),
    ),
  );
}
