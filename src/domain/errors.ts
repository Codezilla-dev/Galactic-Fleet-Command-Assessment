export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class InsufficientResourcesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientResourcesError';
    Object.setPrototypeOf(this, InsufficientResourcesError.prototype);
  }
}
