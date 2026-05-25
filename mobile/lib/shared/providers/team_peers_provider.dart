/// Team-peer roster shared by any *_TEAM_VIEW screen.
///
/// Hits `GET /api/teams/peers` — returns the same population resolved by the
/// backend `TeamScopeService.getTeamPeerUserIds`, which is what the team-scope
/// Standup / EOD / Attendance endpoints use under the hood. We use this to
/// populate the **User** filter dropdown on Team Standups / Team EODs with
/// every peer, not just those who happen to have an entry on the visible page.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/api_client.dart';

class TeamPeer {
  const TeamPeer({
    required this.id,
    required this.name,
    this.email,
    this.avatarUrl,
  });

  final String id;
  final String name;
  final String? email;
  final String? avatarUrl;
}

final teamPeersProvider =
    FutureProvider.autoDispose<List<TeamPeer>>((ref) async {
  final res = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/teams/peers',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = res['data'] as Map<String, dynamic>? ?? const {};
  final list = (data['peers'] ?? const []) as List;
  return list.map((e) {
    final m = Map<String, dynamic>.from(e as Map);
    return TeamPeer(
      id:        (m['id'] ?? '').toString(),
      name:      (m['name'] ?? 'Team member').toString(),
      email:     m['email']?.toString(),
      avatarUrl: m['avatarUrl']?.toString(),
    );
  }).where((p) => p.id.isNotEmpty).toList();
});
