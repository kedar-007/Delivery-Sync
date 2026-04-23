'use strict';

class ResponseHelper {
  static success(res, data = null, message = 'Success') {
    return res.status(200).json({ success: true, message, data });
  }
  static created(res, data = null, message = 'Created successfully') {
    return res.status(201).json({ success: true, message, data });
  }
  static validationError(res, message = 'Validation failed', errors = []) {
    return res.status(400).json({ success: false, message, errors });
  }
  static unauthorized(res, message = 'Authentication required') {
    return res.status(401).json({ success: false, message });
  }
  static forbidden(res, message = 'Access denied') {
    return res.status(403).json({ success: false, message });
  }
  static notFound(res, message = 'Resource not found') {
    return res.status(404).json({ success: false, message });
  }
  static serverError(res, message = 'Internal server error') {
    return res.status(500).json({ success: false, message });
  }
}

module.exports = ResponseHelper;
