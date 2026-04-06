// Widget tests for the StandupScreen.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_sync/core/theme/app_theme.dart';
import 'package:delivery_sync/features/auth/providers/auth_provider.dart';
import 'package:delivery_sync/features/dashboard/providers/dashboard_provider.dart';
import 'package:delivery_sync/features/standup/presentation/screens/standup_screen.dart';
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

final _fakeProjects = [
  const Project(id: 'p1', name: 'Phoenix', ragStatus: 'GREEN', status: 'ACTIVE'),
  const Project(id: 'p2', name: 'Orion',   ragStatus: 'AMBER', status: 'ACTIVE'),
];

void main() {
  group('StandupScreen', () {
    testWidgets('renders app bar title', (tester) async {
      await tester.pumpWidget(_wrap(
        const StandupScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
          projectsProvider.overrideWith((_) => Completer<List<Project>>().future),
          dashboardSummaryProvider.overrideWith((_) => Completer<DashboardSummary>().future),
        ],
      ));
      expect(find.text('Daily Stand-up'), findsOneWidget);
    });

    testWidgets('shows form fields', (tester) async {
      await tester.pumpWidget(_wrap(
        const StandupScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
          projectsProvider.overrideWith((_) async => _fakeProjects),
          dashboardSummaryProvider.overrideWith((_) => Completer<DashboardSummary>().future),
        ],
      ));
      await tester.pumpAndSettle();

      expect(find.byType(TextFormField), findsWidgets);
    });

    testWidgets('shows submit button', (tester) async {
      await tester.pumpWidget(_wrap(
        const StandupScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuth(_fakeUser)),
          projectsProvider.overrideWith((_) async => _fakeProjects),
          dashboardSummaryProvider.overrideWith((_) => Completer<DashboardSummary>().future),
        ],
      ));
      await tester.pumpAndSettle();

      expect(find.widgetWithText(ElevatedButton, 'Submit Stand-up'), findsOneWidget);
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
