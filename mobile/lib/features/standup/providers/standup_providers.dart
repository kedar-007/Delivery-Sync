/// Standup feature providers.
///
/// Currently exposes the paginated *team* standups feed used by the "Team
/// Standups" tab. Mirrors the web hook `useStandupsPaged` shape — fetches
/// `${baseCore}/standups?scope=team&...` and returns both the rows and the
/// pagination block so the UI can render a "Showing X–Y of N" footer.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/services/api_client.dart';

/// Parameters for the team-standups query. Implements equality so the
/// auto-disposed family provider correctly de-duplicates identical fetches.
class TeamStandupsParams {
  const TeamStandupsParams({
    required this.page,
    required this.pageSize,
    this.startDate,
    this.endDate,
    this.userId,
    this.projectId,
  });

  final int page;
  final int pageSize;
  final String? startDate;
  final String? endDate;
  final String? userId;
  final String? projectId;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TeamStandupsParams &&
          runtimeType == other.runtimeType &&
          page == other.page &&
          pageSize == other.pageSize &&
          startDate == other.startDate &&
          endDate == other.endDate &&
          userId == other.userId &&
          projectId == other.projectId;

  @override
  int get hashCode => Object.hash(
        page, pageSize, startDate, endDate, userId, projectId,
      );
}

/// Result of a paginated team-standups fetch — rows plus pagination metadata.
class TeamStandupsResult {
  const TeamStandupsResult({
    required this.entries,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.totalPages,
  });

  final List<Map<String, dynamic>> entries;
  final int page;
  final int pageSize;
  final int total;
  final int totalPages;
}

/// Fetches one page of team standups. The backend already supports the full
/// filter set we need (`scope=team&page=&pageSize=&startDate=&endDate=&userId=&projectId=`).
final teamStandupsProvider = FutureProvider.autoDispose
    .family<TeamStandupsResult, TeamStandupsParams>((ref, params) async {
  final qp = <String, dynamic>{
    'scope':    'team',
    'page':     params.page.toString(),
    'pageSize': params.pageSize.toString(),
  };
  if (params.startDate != null && params.startDate!.isNotEmpty) {
    qp['startDate'] = params.startDate;
  }
  if (params.endDate != null && params.endDate!.isNotEmpty) {
    qp['endDate'] = params.endDate;
  }
  if (params.userId != null && params.userId!.isNotEmpty) {
    qp['userId'] = params.userId;
  }
  if (params.projectId != null && params.projectId!.isNotEmpty) {
    qp['projectId'] = params.projectId;
  }

  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/standups',
    queryParameters: qp,
    fromJson: (r) => r as Map<String, dynamic>,
  );

  final data = raw['data'] as Map<String, dynamic>? ?? const {};
  final list = (data['standups'] ?? const []) as List;
  final entries = list
      .map((e) => Map<String, dynamic>.from(e as Map))
      .toList();

  final pag = data['pagination'] as Map<String, dynamic>? ?? const {};
  final total = (pag['total'] as num?)?.toInt() ?? entries.length;
  final totalPages = (pag['totalPages'] as num?)?.toInt() ??
      ((total / params.pageSize).ceil().clamp(1, 1 << 30));

  return TeamStandupsResult(
    entries:    entries,
    page:       (pag['page']     as num?)?.toInt() ?? params.page,
    pageSize:   (pag['pageSize'] as num?)?.toInt() ?? params.pageSize,
    total:      total,
    totalPages: totalPages < 1 ? 1 : totalPages,
  );
});
