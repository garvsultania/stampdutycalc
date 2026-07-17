export class WatchdogError extends Error {
  constructor(
    message: string,
    readonly kind: "source_unreachable" | "shape_drift" | "partial",
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WatchdogError";
  }
}
