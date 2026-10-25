// Stand-in for the API's InvalidStateTransitionException (the real one carries an error code).
export class InvalidStateTransitionException extends Error {
  constructor(from: string, to: string) {
    super(`Invalid order state transition: ${from} -> ${to}`);
    this.name = "InvalidStateTransitionException";
  }
}
