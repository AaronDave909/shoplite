'use strict';

// Errors with an HTTP status. Anything without a status is a bug and becomes a 500.
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    if (details) this.details = details;
  }
}

/** Bad user input. Returns 400 with a readable message. */
class ValidationError extends HttpError {
  constructor(message, details) {
    super(400, message, details);
  }
}

class NotFoundError extends HttpError {
  constructor(message) {
    super(404, message);
  }
}

class ConflictError extends HttpError {
  constructor(message, details) {
    super(409, message, details);
  }
}

module.exports = { HttpError, ValidationError, NotFoundError, ConflictError };
