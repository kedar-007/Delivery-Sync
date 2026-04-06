// Widget tests for the SprintsScreen.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_sync/core/theme/app_theme.dart';
import 'package:delivery_sync/features/auth/providers/auth_provider.dart';
import 'package:delivery_sync/features/sprints/presentation/screens/sprints_screen.dart';
import 'package:delivery_sync/shared/models/models.dart';

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
  group('SprintsScreen', () {
    testWidgets('renders app bar title', (tester) async {
      await tester.pumpWidget(_wrap(
        const SprintsScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
        ],
      ));
      expect(find.text('Sprints & Tasks'), findsOneWidget);
    });

    testWidgets('shows My Tasks and Board tabs', (tester) async {
      await tester.pumpWidget(_wrap(
        const SprintsScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
        ],
      ));
      expect(find.text('My Tasks'), findsOneWidget);
      expect(find.text('Board'),    findsOneWidget);
    });

    testWidgets('renders a TabBarView', (tester) async {
      await tester.pumpWidget(_wrap(
        const SprintsScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
        ],
      ));
      expect(find.byType(TabBarView), findsOneWidget);
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
