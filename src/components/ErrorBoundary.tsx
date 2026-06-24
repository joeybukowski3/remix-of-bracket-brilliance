import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional fallback UI. If omitted, a default recovery card is shown. */
  fallback?: ReactNode;
  /** If true, render nothing on error instead of a fallback card (useful for non-critical sections). */
  silent?: boolean;
  /** Section label shown in the fallback card so users know what failed. */
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary
 *
 * Wrap any tree of components so a runtime crash renders a recovery UI
 * instead of killing the entire page (blank white screen).
 *
 * Usage:
 *   <ErrorBoundary>              — full-page wrapper in App.tsx
 *   <ErrorBoundary section="HR Props" silent> — section wrapper (hides on crash)
 *   <ErrorBoundary section="MLB Tables">      — section wrapper (shows fallback card)
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so it's visible in DevTools and any monitoring
    console.error(
      `[ErrorBoundary${this.props.section ? ` · ${this.props.section}` : ""}] Caught:`,
      error,
      info.componentStack
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Custom fallback takes priority
    if (this.props.fallback) return this.props.fallback;

    // Silent mode — render nothing (good for non-critical widgets)
    if (this.props.silent) return null;

    const label = this.props.section ?? "This section";

    return (
      <div
        style={{
          margin: "24px auto",
          maxWidth: 600,
          padding: "28px 24px",
          borderRadius: 14,
          background: "#fefce8",
          border: "1px solid #fde68a",
          textAlign: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#92400e",
            margin: "0 0 6px",
          }}
        >
          {label} couldn't load
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "#a16207",
            margin: "0 0 16px",
            lineHeight: 1.5,
          }}
        >
          Something went wrong rendering this part of the page. The rest of the
          site should still work.
        </p>
        <button
          onClick={this.handleRetry}
          style={{
            background: "#f59e0b",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
      </div>
    );
  }
}
