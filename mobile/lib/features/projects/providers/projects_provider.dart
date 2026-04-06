import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/services/api_client.dart';
import '../../../shared/models/models.dart';

/// Shared provider for the projects list — used by both the Projects screen
/// and the AI Insights screen.
final projectsListProvider =
    FutureProvider.autoDispose<List<Project>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/projects',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list;
  if (data is List) {
    list = data;
  } else if (data is Map) {
    list = (data['projects'] as List<dynamic>?) ?? [];
  } else {
    list = [];
  }
  return list.map((e) => Project.fromJson(e as Map<String, dynamic>)).toList();
});
