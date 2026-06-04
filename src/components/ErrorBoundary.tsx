import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Called once when an error is caught — use for logging / telemetry. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

/**
 * Generic React error boundary.
 *
 * Wraps a render subtree so a crash (e.g. inside the Ecosystem grid during
 * a match) doesn't take down the whole page. The user can recover via the
 * "Try again" button which resets the error state and re-renders children.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-2xl font-display">Something broke on this screen</h2>
          <p className="text-sm text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md border"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
