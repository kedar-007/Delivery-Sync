'use strict';

/**
 * Centralised HTTP response helpers.
 * All controller responses must flow through this class to ensure a consistent
 * envelope: { success, data?, message?, errors? }
 */
class ResponseHelper {
  /**
   * 200 OK
   */
  static success(res, data = null, message = 'Success') {
    return res.status(200).json({ success: true, message, data });
  }

  /**
   * 201 Created
   */
  static created(res, data = null, message = 'Created successfully') {
    return res.status(201).json({ success: true, message, data });
  }

  /**
   * 400 Bad Request – validation errors
   */
  static validationError(res, message = 'Validation failed', errors = []) {
    return res.status(400).json({ success: false, message, errors });
  }

  /**
   * 401 Unauthorised – missing / invalid auth
   */
  static unauthorized(res, message = 'Authentication required') {
    return res.status(401).json({ success: false, message });
  }

  /**
   * 403 Forbidden – authenticated but not permitted
   */
  static forbidden(res, message = 'Access denied') {
    return res.status(403).json({ success: false, message });
  }

  /**
   * 404 Not Found
   */
  static notFound(res, message = 'Resource not found') {
    return res.status(404).json({ success: false, message });
  }

  /**
   * 409 Conflict – duplicate entry etc.
   */
  static conflict(res, message = 'Resource already exists') {
    return res.status(409).json({ success: false, message });
  }

  /**
   * 500 Internal Server Error
   */
  static serverError(res, message = 'Internal server error', debug = null) {
    const body = { success: false, message };
    if (debug && process.env.NODE_ENV !== 'production') {
      body.debug = debug;
    }
    return res.status(500).json(body);
  }

  /**
   * Paginated list response helper
   */
  static paginated(res, data, total, page, pageSize) {
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  }
}

module.exports = ResponseHelper;
