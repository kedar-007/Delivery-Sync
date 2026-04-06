// Widget tests for the ActionsScreen.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_sync/core/theme/app_theme.dart';
import 'package:delivery_sync/features/auth/providers/auth_provider.dart';
import 'package:delivery_sync/features/actions/presentation/screens/actions_screen.dart';
import 'package:delivery_sync/shared/models/models.dart';

// Expose the internal provider for testing via the library export
// We re-declare it here using the same key if needed, or just test the UI.

Widget _wrap(Widget child, {List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      theme:    AppTheme.light,
      darkTheme: AppTheme.dark,
      home:     child,
    ),
  );
}

const _fakeUser = CurrentUser(
  id: '1', email: 'x@x.com', name: 'Test User',
  role: 'TEAM_MEMBER', tenantId: '1',
);

void main() {
  group('ActionsScreen', () {
    testWidgets('renders app bar title', (tester) async {
      await tester.pumpWidget(_wrap(
        const ActionsScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
        ],
      ));
      expect(find.text('Actions'), findsOneWidget);
    });

    testWidgets('shows filter chips', (tester) async {
      await tester.pumpWidget(_wrap(
        const ActionsScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
        ],
      ));
      expect(find.text('All'),         findsOneWidget);
      expect(find.text('Open'),        findsOneWidget);
      expect(find.text('In Progress'), findsOneWidget);
      expect(find.text('Done'),        findsOneWidget);
    });

    testWidgets('FAB is present', (tester) async {
      await tester.pumpWidget(_wrap(
        const ActionsScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
        ],
      ));
      expect(find.byType(FloatingActionButton), findsOneWidget);
    });
  });
}

class _FakeAuth extends AuthNotifier {
  _FakeAuth(this._user);
  final CurrentUser _user;

  @override
  AuthState build() => AuthState(
        status: AuthStatus.authenticated,
        user:   _user,
      );

  @override Future<void> checkAuth() async {}
  @override Future<bool> signIn()    async => true;
  @override Future<void> signOut()   async {}
}
