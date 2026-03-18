'use strict';

/**
 * Normalises errors from Axios requests (e.g. Zoho LLM API calls) into a
 * consistent shape that callers can inspect without knowing Axios internals.
 *
 * @param {Error} error  - The caught error (may or may not have .response)
 * @param {string} type  - Human label for the failing service (e.g. "LLM")
 * @returns {{ success: false, status: number, message: string, details?: any }}
 */
function handleAPIError(error, type = 'API') {
  if (error.response) {
    // Server responded with a non-2xx status
    return {
      success: false,
      status:  error.response.status,
      message: error.response.data?.message || `Zoho Catalyst ${type} API responded with an error`,
      details: error.response.data,
    };
  }

  if (error.request) {
    // Request was sent but no response received (timeout / network error)
    return {
      success: false,
      status:  504,
      message: `No response from ${type} API. Please try again later.`,
    };
  }

  // Something went wrong building the request
  return {
    success: false,
    status:  500,
    message: error.message || `Unexpected error in ${type}`,
  };
}

module.exports = { handleAPIError };
