// Widget tests for the DashboardScreen.
// Run with: flutter test test/widget/dashboard_test.dart

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_sync/core/theme/app_theme.dart';
import 'package:delivery_sync/features/auth/providers/auth_provider.dart';
import 'package:delivery_sync/features/dashboard/presentation/screens/dashboard_screen.dart';
import 'package:delivery_sync/features/dashboard/providers/dashboard_provider.dart';
import 'package:delivery_sync/shared/models/models.dart';

// ── Helpers ───────────────────────────────────────────────────────────────────

Widget _wrap(Widget child, {List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      theme:     AppTheme.light,
      darkTheme: AppTheme.dark,
      home:      child,
    ),
  );
}

const _fakeUser = CurrentUser(
  id:       '1',
  email:    'test@example.com',
  name:     'Ada Lovelace',
  role:     'DELIVERY_LEAD',
  tenantId: '10',
  status:   'ACTIVE',
);

const _fakeSummary = DashboardSummary(
  totalProjects:  3,
  activeProjects: 3,
  openBlockers:   0,
  openActions:    1,
  ragBreakdown:   {'RED': 0, 'AMBER': 1, 'GREEN': 2},
  submittedStandup: true,
);

const _fakeSummaryNeedsStandup = DashboardSummary(
  totalProjects:  2,
  activeProjects: 2,
  openBlockers:   1,
  openActions:    3,
  ragBreakdown:   {'RED': 1, 'AMBER': 0, 'GREEN': 1},
  submittedStandup: false,
);

final _fakeProjects = [
  const Project(id: 'p1', name: 'Project Alpha', ragStatus: 'GREEN', status: 'ACTIVE'),
  const Project(id: 'p2', name: 'Project Beta',  ragStatus: 'AMBER', status: 'ACTIVE'),
];

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('DashboardScreen', () {

    testWidgets('shows loading shimmer while fetching', (tester) async {
      await tester.pumpWidget(_wrap(
        const DashboardScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier(_fakeUser)),
          // Keep providers in loading state indefinitely
          dashboardSummaryProvider.overrideWith((_) => Completer<DashboardSummary>().future),
          projectsProvider.overrideWith((_) => Completer<List<Project>>().future),
          myTasksProvider.overrideWith((_) => Completer<List<SprintTask>>().future),
        ],
      ));

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('shows greeting with user first name', (tester) async {
      await tester.pumpWidget(_wrap(
        const DashboardScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier(_fakeUser)),
          dashboardSummaryProvider.overrideWith((_) async => _fakeSummary),
          projectsProvider.overrideWith((_) async => _fakeProjects),
          myTasksProvider.overrideWith((_) async => <SprintTask>[]),
        ],
      ));

      await tester.pumpAndSettle();

      expect(find.textContaining('Ada'), findsWidgets);
    });

    testWidgets('shows standup nudge when not submitted', (tester) async {
      await tester.pumpWidget(_wrap(
        const DashboardScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier(_fakeUser)),
          dashboardSummaryProvider.overrideWith((_) async => _fakeSummaryNeedsStandup),
          projectsProvider.overrideWith((_) async => _fakeProjects),
          myTasksProvider.overrideWith((_) async => <SprintTask>[]),
        ],
      ));

      await tester.pumpAndSettle();

      expect(find.text('Stand-up pending'), findsOneWidget);
      expect(find.text('Post'), findsOneWidget);
    });

    testWidgets('does NOT show standup nudge when already submitted', (tester) async {
      await tester.pumpWidget(_wrap(
        const DashboardScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier(_fakeUser)),
          dashboardSummaryProvider.overrideWith((_) async => _fakeSummary),
          projectsProvider.overrideWith((_) async => _fakeProjects),
          myTasksProvider.overrideWith((_) async => <SprintTask>[]),
        ],
      ));

      await tester.pumpAndSettle();

      expect(find.text('Stand-up pending'), findsNothing);
    });

    testWidgets('shows metric cards when summary is loaded', (tester) async {
      await tester.pumpWidget(_wrap(
        const DashboardScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier(_fakeUser)),
          dashboardSummaryProvider.overrideWith((_) async => _fakeSummary),
          projectsProvider.overrideWith((_) async => _fakeProjects),
          myTasksProvider.overrideWith((_) async => <SprintTask>[]),
        ],
      ));

      await tester.pumpAndSettle();

      expect(find.text('Active Projects'),   findsOneWidget);
      expect(find.text('Critical Blockers'), findsOneWidget);
      expect(find.text('Overdue Actions'),   findsOneWidget);
    });

    testWidgets('shows project names in project list', (tester) async {
      await tester.pumpWidget(_wrap(
        const DashboardScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier(_fakeUser)),
          dashboardSummaryProvider.overrideWith((_) async => _fakeSummary),
          projectsProvider.overrideWith((_) async => _fakeProjects),
          myTasksProvider.overrideWith((_) async => <SprintTask>[]),
        ],
      ));

      await tester.pumpAndSettle();

      expect(find.text('Project Alpha'), findsOneWidget);
      expect(find.text('Project Beta'),  findsOneWidget);
    });

    testWidgets('shows empty tasks message when no tasks', (tester) async {
      await tester.pumpWidget(_wrap(
        const DashboardScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier(_fakeUser)),
          dashboardSummaryProvider.overrideWith((_) async => _fakeSummary),
          projectsProvider.overrideWith((_) async => <Project>[]),
          myTasksProvider.overrideWith((_) async => <SprintTask>[]),
        ],
      ));

      await tester.pumpAndSettle();

      expect(find.text('No tasks assigned'), findsOneWidget);
    });

    testWidgets('error state shows error text', (tester) async {
      await tester.pumpWidget(_wrap(
        const DashboardScreen(),
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier(_fakeUser)),
          dashboardSummaryProvider.overrideWith((_) async => throw 'Network error'),
          projectsProvider.overrideWith((_) async => throw 'Network error'),
          myTasksProvider.overrideWith((_) async => <SprintTask>[]),
        ],
      ));

      await tester.pumpAndSettle();

      expect(find.textContaining('Error:'), findsWidgets);
    });
  });
}

// ── Fake auth notifier ────────────────────────────────────────────────────────

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(this._user);
  final CurrentUser _user;

  @override
  AuthState build() => AuthState(
        status: AuthStatus.authenticated,
        user:   _user,
      );

  @override
  Future<void> checkAuth() async {}

  @override
  Future<bool> signIn() async => true;

  @override
  Future<void> signOut() async {}
}
