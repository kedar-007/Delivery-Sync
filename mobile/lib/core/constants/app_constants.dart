// ignore_for_file: constant_identifier_names

/// Central constants for the Delivery Sync mobile app.
/// Fill in the Catalyst project credentials below.
class AppConstants {
  AppConstants._();

  // ── Catalyst ────────────────────────────────────────────────────────────────
  /// Your Zoho Catalyst Project ID (found in Catalyst console → Settings)
  static const String catalystProjectId     = '17682000000819069';
  static const String catalystPortalId      = '50039299089';
  static const String catalystProjectDomain = 'https://delivery-sync-60040289923.development.catalystserverless.in';

  /// Catalyst Push Notification App ID — fill in once you set up push
  /// notifications in Catalyst Console → Push Notification → your app → App ID
  static const String notificationAppId    = '{{notificationAppID}}';

  // ── API base paths (Catalyst Advanced I/O functions) ───────────────────────
  static const String baseCore     = '/server/delivery_sync_function/api';
  static const String basePeople   = '/server/people_service/api/people';
  static const String baseSprints  = '/server/task_sprint_service/api/ts';
  static const String baseTime     = '/server/time_tracking_service/api/time';
  static const String baseAssets   = '/server/asset_service/api/assets';
  static const String baseBadge    = '/server/badge_profile_service/api/bp';
  static const String baseReports  = '/server/reporting_service/api/reports';
  static const String baseAI       = '/server/ai_service/api/ai';
  static const String baseAdmin    = '/server/admin_config_service/api/config';

  // ── Storage keys ────────────────────────────────────────────────────────────
  static const String keyTenantSlug  = 'tenant_slug';
  static const String keyUserRole    = 'user_role';
  static const String keyUserId      = 'user_id';
  static const String keyAuthToken   = 'auth_token';

  // ── Pagination ──────────────────────────────────────────────────────────────
  static const int pageSize = 20;

  // ── Timeouts ────────────────────────────────────────────────────────────────
  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);
}

/// All user role strings — mirror backend RBAC.
class UserRole {
  UserRole._();
  static const String superAdmin    = 'SUPER_ADMIN';
  static const String tenantAdmin   = 'TENANT_ADMIN';
  static const String pmo           = 'PMO';
  static const String deliveryLead  = 'DELIVERY_LEAD';
  static const String teamMember    = 'TEAM_MEMBER';
  static const String exec          = 'EXEC';
  static const String client        = 'CLIENT';

  static bool canWrite(String role) => const {
    superAdmin, tenantAdmin, pmo, deliveryLead, teamMember,
  }.contains(role);

  static bool isAdmin(String role) => const {
    superAdmin, tenantAdmin,
  }.contains(role);

  static bool isExec(String role) => role == exec;
}

/// RAG status constants.
class RagStatus {
  RagStatus._();
  static const String red   = 'RED';
  static const String amber = 'AMBER';
  static const String green = 'GREEN';
}

/// Navigation route names.
class Routes {
  Routes._();
  static const String login      = '/login';
  static const String shell      = '/';
  static const String dashboard  = 'dashboard';
  static const String projects   = 'projects';
  static const String projectDetail = 'project/:id';
  static const String standup    = 'standup';
  static const String eod        = 'eod';
  static const String people     = 'people';
  static const String sprints    = 'sprints';
  static const String assets     = 'assets';
  static const String profile    = 'profile';
  static const String aiInsights = 'ai-insights';
}
