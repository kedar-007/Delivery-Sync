import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/services/api_client.dart';
import '../../../shared/models/models.dart';

// ── Dashboard summary ─────────────────────────────────────────────────────────

final dashboardSummaryProvider =
    FutureProvider.autoDispose<DashboardSummary>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/dashboard/summary',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  return DashboardSummary.fromJson(raw['data'] ?? raw);
});

// ── Projects list ──────────────────────────────────────────────────────────────

final projectsProvider =
    FutureProvider.autoDispose<List<Project>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/projects',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  // API returns { success, data: { projects: [...] } }
  final data = raw['data'];
  final List<dynamic> list;
  if (data is List) {
    list = data;
  } else if (data is Map) {
    list = (data['projects'] as List<dynamic>?) ?? [];
  } else {
    list = [];
  }
  return list
      .map((e) => Project.fromJson(e as Map<String, dynamic>))
      .toList();
});

// ── Actions (open) ─────────────────────────────────────────────────────────────

final openActionsProvider =
    FutureProvider.autoDispose<List<Action>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/actions',
    queryParameters: {'status': 'OPEN'},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  // API returns { success, data: { actions: [...] } }
  final data = raw['data'];
  final List<dynamic> list;
  if (data is List) {
    list = data;
  } else if (data is Map) {
    list = (data['actions'] as List<dynamic>?) ?? [];
  } else {
    list = [];
  }
  return list
      .map((e) => Action.fromJson(e as Map<String, dynamic>))
      .toList();
});

// ── Announcements ─────────────────────────────────────────────────────────────

final announcementsProvider =
    FutureProvider.autoDispose<List<Announcement>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/announcements/list',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list;
  if (data is List) {
    list = data;
  } else if (data is Map) {
    list = (data['announcements'] as List<dynamic>?) ?? [];
  } else {
    list = [];
  }
  return list
      .map((e) => Announcement.fromJson(e as Map<String, dynamic>))
      .toList();
});

// ── My tasks (sprints) ────────────────────────────────────────────────────────

final myTasksProvider =
    FutureProvider.autoDispose<List<SprintTask>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseSprints}/tasks/my-tasks',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list;
  if (data is List) {
    list = data;
  } else if (data is Map) {
    list = (data['tasks'] as List<dynamic>?)
        ?? (data['myTasks'] as List<dynamic>?)
        ?? [];
  } else {
    list = [];
  }
  return list
      .map((e) => SprintTask.fromJson(e as Map<String, dynamic>))
      .toList();
});
