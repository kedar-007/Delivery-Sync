// Unit tests for all shared data models.
// Run with: flutter test test/unit/models_test.dart

import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:delivery_sync/shared/models/models.dart';

void main() {
  // ─────────────────────────────────────────────────────────────────────────
  // CurrentUser
  // ─────────────────────────────────────────────────────────────────────────
  group('CurrentUser.fromJson', () {
    test('parses all fields', () {
      final json = {
        'id':         '42',
        'email':      'alice@example.com',
        'name':       'Alice Smith',
        'role':       'DELIVERY_LEAD',
        'tenantId':   '10',
        'tenantName': 'Acme Corp',
        'tenantSlug': 'acme',
        'avatarUrl':  'https://cdn.example.com/alice.png',
        'status':     'ACTIVE',
      };
      final user = CurrentUser.fromJson(json);
      expect(user.id,         '42');
      expect(user.email,      'alice@example.com');
      expect(user.name,       'Alice Smith');
      expect(user.role,       'DELIVERY_LEAD');
      expect(user.tenantId,   '10');
      expect(user.tenantName, 'Acme Corp');
      expect(user.tenantSlug, 'acme');
      expect(user.avatarUrl,  'https://cdn.example.com/alice.png');
      expect(user.status,     'ACTIVE');
    });

    test('uses defaults for missing optional fields', () {
      final user = CurrentUser.fromJson({
        'id': '1', 'email': 'bob@x.com', 'name': 'Bob',
        'role': 'TEAM_MEMBER', 'tenantId': '5',
      });
      expect(user.tenantName, isNull);
      expect(user.tenantSlug, isNull);
      expect(user.avatarUrl,  isNull);
      expect(user.status,     'ACTIVE');
    });

    test('converts numeric id to string', () {
      final user = CurrentUser.fromJson({
        'id': 99, 'email': 'c@x.com', 'name': 'C',
        'role': 'PMO', 'tenantId': 7,
      });
      expect(user.id,       '99');
      expect(user.tenantId, '7');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Project
  // ─────────────────────────────────────────────────────────────────────────
  group('Project.fromJson', () {
    test('parses full project', () {
      final json = {
        'id':          '100',
        'name':        'Phoenix',
        'ragStatus':   'AMBER',
        'status':      'ACTIVE',
        'description': 'Rewrite project',
        'startDate':   '2024-01-01',
        'endDate':     '2024-12-31',
        'memberCount': 8,
      };
      final p = Project.fromJson(json);
      expect(p.id,          '100');
      expect(p.name,        'Phoenix');
      expect(p.ragStatus,   'AMBER');
      expect(p.status,      'ACTIVE');
      expect(p.description, 'Rewrite project');
      expect(p.memberCount, 8);
    });

    test('defaults ragStatus to GREEN', () {
      final p = Project.fromJson({
        'id': '1', 'name': 'Test', 'status': 'ACTIVE',
      });
      expect(p.ragStatus,   'GREEN');
      expect(p.memberCount, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DashboardSummary
  // ─────────────────────────────────────────────────────────────────────────
  group('DashboardSummary.fromJson', () {
    test('parses nested stats shape', () {
      final json = {
        'projects': [{'id': '1'}, {'id': '2'}],
        'ragSummary': {'RED': 1, 'AMBER': 2, 'GREEN': 3},
        'stats': {
          'totalProjects':       5,
          'overdueActionsCount': 4,
          'criticalBlockersCount': 2,
        },
        'missingStandups': [],
      };
      final d = DashboardSummary.fromJson(json);
      expect(d.totalProjects,   5);
      expect(d.openBlockers,    2);
      expect(d.openActions,     4);
      expect(d.ragBreakdown['RED'],   1);
      expect(d.ragBreakdown['AMBER'], 2);
      expect(d.ragBreakdown['GREEN'], 3);
      expect(d.submittedStandup, true); // missingStandups is empty
    });

    test('detects missing standup', () {
      final json = {
        'projects': [],
        'ragSummary': {},
        'stats': {},
        'missingStandups': ['project-1'],
      };
      final d = DashboardSummary.fromJson(json);
      expect(d.submittedStandup, false);
    });

    test('falls back to flat shape', () {
      final json = {
        'totalProjects':  3,
        'openBlockers':   1,
        'openActions':    6,
        'ragBreakdown': {'RED': 0, 'AMBER': 1, 'GREEN': 2},
        'submittedStandup': true,
      };
      final d = DashboardSummary.fromJson(json);
      expect(d.openActions,      6);
      expect(d.submittedStandup, true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // StandupEntry
  // ─────────────────────────────────────────────────────────────────────────
  group('StandupEntry.fromJson', () {
    test('parses standup entry', () {
      final json = {
        'id':        '55',
        'projectId': '10',
        'userId':    '42',
        'date':      '2024-06-15',
        'yesterday': 'Fixed auth bug',
        'today':     'Sprint planning',
        'blockers':  'Waiting for design review',
      };
      final s = StandupEntry.fromJson(json);
      expect(s.id,        '55');
      expect(s.yesterday, 'Fixed auth bug');
      expect(s.blockers,  'Waiting for design review');
    });

    test('blockers defaults to null', () {
      final s = StandupEntry.fromJson({
        'id': '1', 'projectId': '2', 'userId': '3',
        'date': '2024-01-01', 'yesterday': 'y', 'today': 't',
      });
      expect(s.blockers, isNull);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SprintTask
  // ─────────────────────────────────────────────────────────────────────────
  group('SprintTask.fromJson', () {
    test('parses basic task', () {
      final json = {
        'id':          '200',
        'title':       'Build login screen',
        'status':      'IN_PROGRESS',
        'priority':    'HIGH',
        'storyPoints': 5,
      };
      final t = SprintTask.fromJson(json);
      expect(t.id,          '200');
      expect(t.title,       'Build login screen');
      expect(t.status,      'IN_PROGRESS');
      expect(t.priority,    'HIGH');
      expect(t.storyPoints, 5);
    });

    test('parses assignee_ids as List', () {
      final t = SprintTask.fromJson({
        'id': '1', 'title': 'T', 'status': 'TODO', 'priority': 'LOW',
        'assignee_ids': ['user-1', 'user-2'],
      });
      expect(t.assigneeId, 'user-1');
    });

    test('parses assignee_ids as JSON string', () {
      final t = SprintTask.fromJson({
        'id': '1', 'title': 'T', 'status': 'TODO', 'priority': 'LOW',
        'assignee_ids': jsonEncode(['user-99']),
      });
      expect(t.assigneeId, 'user-99');
    });

    test('handles missing assignee_ids gracefully', () {
      final t = SprintTask.fromJson({
        'id': '1', 'title': 'T', 'status': 'TODO', 'priority': 'LOW',
      });
      expect(t.assigneeId, isNull);
    });

    test('uses ROWID as fallback id', () {
      final t = SprintTask.fromJson({
        'ROWID': '777', 'title': 'T', 'status': 'TODO', 'priority': 'LOW',
      });
      expect(t.id, '777');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Blocker
  // ─────────────────────────────────────────────────────────────────────────
  group('Blocker.fromJson', () {
    test('parses blocker with all fields', () {
      final json = {
        'id':          'b1',
        'projectId':   'p1',
        'title':       'DB connection timeout',
        'severity':    'CRITICAL',
        'status':      'OPEN',
        'description': 'Prod DB times out under load',
        'ownerUserId': 'u1',
        'resolution':  null,
        'resolvedDate': null,
        'createdAt':   '2024-06-10T10:00:00Z',
      };
      final b = Blocker.fromJson(json);
      expect(b.id,        'b1');
      expect(b.severity,  'CRITICAL');
      expect(b.status,    'OPEN');
      expect(b.createdAt, '2024-06-10T10:00:00Z');
    });

    test('defaults to severity MEDIUM and status OPEN', () {
      final b = Blocker.fromJson({
        'id': 'b2', 'projectId': 'p1', 'title': 'Slow API',
      });
      expect(b.severity, 'MEDIUM');
      expect(b.status,   'OPEN');
    });

    test('statusDisplay returns readable label', () {
      expect(
          Blocker.fromJson({'id': '', 'projectId': '', 'title': '',
            'status': 'RESOLVED', 'severity': 'LOW'}).statusDisplay,
          'Resolved');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TimeEntry
  // ─────────────────────────────────────────────────────────────────────────
  group('TimeEntry.fromJson', () {
    test('parses time entry', () {
      final json = {
        'id':          'te1',
        'userId':      'u1',
        'date':        '2024-06-12',
        'hours':       7.5,
        'isBillable':  true,
        'status':      'APPROVED',
        'projectId':   'p1',
        'description': 'API development',
      };
      final e = TimeEntry.fromJson(json);
      expect(e.id,          'te1');
      expect(e.hours,       7.5);
      expect(e.isBillable,  true);
      expect(e.status,      'APPROVED');
      expect(e.description, 'API development');
    });

    test('defaults to DRAFT status and 0 hours', () {
      final e = TimeEntry.fromJson({
        'id': 'x', 'userId': 'u', 'date': '2024-01-01',
        'isBillable': false,
      });
      expect(e.status, 'DRAFT');
      expect(e.hours,  0.0);
    });

    test('statusDisplay works', () {
      expect(
          TimeEntry.fromJson({'id': '', 'userId': '', 'date': '',
            'hours': 1, 'isBillable': false, 'status': 'SUBMITTED'})
              .statusDisplay,
          'Submitted');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LeaveRequest
  // ─────────────────────────────────────────────────────────────────────────
  group('LeaveRequest.fromJson', () {
    test('parses leave request', () {
      final json = {
        'id':        'lr1',
        'userId':    'u1',
        'leaveType': 'ANNUAL',
        'startDate': '2024-07-01',
        'endDate':   '2024-07-05',
        'reason':    'Family vacation',
        'status':    'PENDING',
      };
      final r = LeaveRequest.fromJson(json);
      expect(r.leaveType, 'ANNUAL');
      expect(r.status,    'PENDING');
      expect(r.reason,    'Family vacation');
    });

    test('statusDisplay returns readable label', () {
      final r = LeaveRequest.fromJson({
        'id': '', 'userId': '', 'leaveType': 'SICK',
        'startDate': '', 'endDate': '', 'reason': '', 'status': 'APPROVED',
      });
      expect(r.statusDisplay, 'Approved');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RaidItem
  // ─────────────────────────────────────────────────────────────────────────
  group('RaidItem.fromJson', () {
    test('parses raid item', () {
      final json = {
        'id':          'ri1',
        'projectId':   'p1',
        'type':        'RISK',
        'title':       'Third-party API outage',
        'status':      'OPEN',
        'priority':    'HIGH',
        'impact':      'HIGH',
        'description': 'Integration with payment provider may fail',
      };
      final r = RaidItem.fromJson(json);
      expect(r.type,     'RISK');
      expect(r.priority, 'HIGH');
      expect(r.impact,   'HIGH');
    });

    test('typeDisplay returns readable label', () {
      final r = RaidItem.fromJson({
        'id': '', 'projectId': '', 'type': 'DEPENDENCY',
        'title': '', 'status': '', 'priority': '', 'impact': '',
      });
      expect(r.typeDisplay, 'Dependency');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LeaveBalance
  // ─────────────────────────────────────────────────────────────────────────
  group('LeaveBalance.fromJson', () {
    test('parses balance correctly', () {
      final b = LeaveBalance.fromJson({
        'leaveType': 'ANNUAL',
        'total':     20.0,
        'used':      5.0,
        'remaining': 15.0,
      });
      expect(b.total,     20.0);
      expect(b.used,      5.0);
      expect(b.remaining, 15.0);
    });

    test('defaults to 0 when values missing', () {
      final b = LeaveBalance.fromJson({'leaveType': 'SICK'});
      expect(b.total,     0.0);
      expect(b.remaining, 0.0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sprint
  // ─────────────────────────────────────────────────────────────────────────
  group('Sprint.fromJson', () {
    test('parses sprint with all fields', () {
      final s = Sprint.fromJson({
        'id':              's1',
        'name':            'Sprint 3',
        'projectId':       'p1',
        'status':          'ACTIVE',
        'startDate':       '2024-06-01',
        'endDate':         '2024-06-14',
        'goalDescription': 'Finish auth module',
        'velocity':        32,
      });
      expect(s.name,     'Sprint 3');
      expect(s.status,   'ACTIVE');
      expect(s.velocity, 32);
    });

    test('statusDisplay works', () {
      final s = Sprint.fromJson({
        'id': '', 'name': '', 'projectId': '', 'status': 'COMPLETED',
      });
      expect(s.statusDisplay, 'Completed');
    });
  });
}
