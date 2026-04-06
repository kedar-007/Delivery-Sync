// Widget tests for the BlockersScreen.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_sync/core/theme/app_theme.dart';
import 'package:delivery_sync/features/auth/providers/auth_provider.dart';
import 'package:delivery_sync/features/blockers/presentation/screens/blockers_screen.dart';
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

final _fakeBlockers = [
  Blocker(
    id: 'b1', projectId: 'p1',
    title: 'CI pipeline broken',
    severity: 'CRITICAL', status: 'OPEN',
  ),
  Blocker(
    id: 'b2', projectId: 'p1',
    title: 'Slow API response',
    severity: 'MEDIUM', status: 'RESOLVED',
  ),
];

void main() {
  group('BlockersScreen', () {
    testWidgets('renders app bar title', (tester) async {
      await tester.pumpWidget(_wrap(
        const BlockersScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
          blockersProvider.overrideWith((_) => Completer<List<Blocker>>().future),
        ],
      ));
      expect(find.text('Blockers'), findsOneWidget);
    });

    testWidgets('shows filter chips', (tester) async {
      await tester.pumpWidget(_wrap(
        const BlockersScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
          blockersProvider.overrideWith((_) => Completer<List<Blocker>>().future),
        ],
      ));
      expect(find.text('All'),      findsOneWidget);
      expect(find.text('Open'),     findsOneWidget);
      expect(find.text('Resolved'), findsOneWidget);
    });

    testWidgets('shows blocker titles when loaded', (tester) async {
      await tester.pumpWidget(_wrap(
        const BlockersScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
          blockersProvider.overrideWith((_) async => _fakeBlockers),
        ],
      ));
      await tester.pumpAndSettle();

      expect(find.text('CI pipeline broken'), findsOneWidget);
      expect(find.text('Slow API response'),  findsOneWidget);
    });

    testWidgets('error state shows error text', (tester) async {
      await tester.pumpWidget(_wrap(
        const BlockersScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
          blockersProvider.overrideWith((_) async => throw 'Network error'),
        ],
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('Error'), findsWidgets);
    });

    testWidgets('FAB is present', (tester) async {
      await tester.pumpWidget(_wrap(
        const BlockersScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
          blockersProvider.overrideWith((_) => Completer<List<Blocker>>().future),
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
