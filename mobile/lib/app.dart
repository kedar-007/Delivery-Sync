import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/providers/auth_provider.dart';

/// Global theme-mode toggle — read via [ref.watch(themeModeProvider)].
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);

class DeliverySyncApp extends ConsumerStatefulWidget {
  const DeliverySyncApp({super.key});

  @override
  ConsumerState<DeliverySyncApp> createState() => _DeliverySyncAppState();
}

class _DeliverySyncAppState extends ConsumerState<DeliverySyncApp> {
  @override
  void initState() {
    super.initState();
    // Check existing auth session on first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authProvider.notifier).checkAuth();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Delivery Sync',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ref.watch(themeModeProvider),
      routerConfig: router,
    );
  }
}
