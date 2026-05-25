/// Maps an in-app notification's entityType + entityId to a concrete route
/// in the mobile app's GoRouter.
///
/// The backend's `sendInApp()` calls use a mix of uppercase ("TASK", "LEAVE")
/// and lowercase ("action", "blocker", "milestone") entityType values, so we
/// normalise to uppercase before matching. When we don't know how to handle
/// a given type, we fall back to /home — better than a dead tap.
///
/// Some notification types pass a projectId in `metadata` (sprint, action,
/// project-scoped task events). We use it when present to deep-link into the
/// right project; otherwise the user lands on the generic list.
library;

class NotificationRoute {
  const NotificationRoute(this.path, {this.queryParameters});
  final String path;
  final Map<String, String>? queryParameters;
}

NotificationRoute? notificationRoute({
  required String? entityType,
  required String? entityId,
  Map<String, dynamic>? metadata,
}) {
  final type = (entityType ?? '').toUpperCase().trim();
  final id   = (entityId   ?? '').trim();
  final projectId = (metadata?['projectId'] ?? metadata?['project_id'])?.toString();

  switch (type) {
    case 'TASK':
      // Land on My Tasks; pass taskId as a query param so the screen can
      // auto-open the task detail (same UX as the web app).
      return NotificationRoute(
        '/sprints/my-tasks',
        queryParameters: id.isNotEmpty ? {'taskId': id} : null,
      );

    case 'SPRINT':
      // Sprint events deep-link into the sprint board for the right project
      // when projectId is supplied; otherwise the generic /sprints view.
      if (projectId != null && projectId.isNotEmpty) {
        return NotificationRoute('/projects/$projectId');
      }
      return const NotificationRoute('/sprints');

    case 'PROJECT':
      return id.isNotEmpty
          ? NotificationRoute('/projects/$id')
          : const NotificationRoute('/projects');

    case 'MILESTONE':
      return const NotificationRoute('/more/milestones');

    case 'ACTION':
      return const NotificationRoute('/more/actions');

    case 'BLOCKER':
      return const NotificationRoute('/more/blockers');

    case 'LEAVE':
      // Specific leave record — the LeaveScreen reads `requestId` to scroll +
      // highlight that row inside the My Leaves / Team Requests tab.
      return NotificationRoute(
        '/more/leave',
        queryParameters: id.isNotEmpty ? {'requestId': id} : null,
      );

    case 'WFH_REQUEST':
      // WFH lives under Attendance, not Leave — match the web app behaviour
      // by also pre-selecting the WFH tab and highlighting the specific row.
      return NotificationRoute(
        '/more/attendance',
        queryParameters: {
          'tab': 'wfh',
          if (id.isNotEmpty) 'requestId': id,
        },
      );

    case 'ATTENDANCE':
      return const NotificationRoute('/more/attendance');

    case 'TIME_ENTRY':
    case 'TIME_APPROVAL':
      return const NotificationRoute('/more/time-tracking');

    case 'ANNOUNCEMENT':
      return const NotificationRoute('/more/announcements');

    case 'BADGE':
    case 'USER_BADGE':
      // Badges are personal achievements — the badges screen is where they
      // live in the mobile app.
      return const NotificationRoute('/more/badges');

    case 'ASSET':
    case 'ASSET_REQUEST':
    case 'ASSET_ASSIGNMENT':
    case 'ASSET_MAINTENANCE':
      return const NotificationRoute('/more/assets');

    case 'TEAM':
      return const NotificationRoute('/more/teams');

    case 'RAID':
    case 'RISK':
    case 'ISSUE':
    case 'DEPENDENCY':
    case 'ASSUMPTION':
      return const NotificationRoute('/more/raid');

    case 'DECISION':
      return const NotificationRoute('/more/decisions');

    default:
      // Unknown entityType — send the user to the Dashboard so the tap still
      // produces a visible result. The fallback gives a better UX than
      // silently ignoring the tap.
      return const NotificationRoute('/home');
  }
}
