import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      
      // Fallback UI (HTML)
      return (
        <div className="p-4 bg-red-900/20 border border-red-500 rounded text-red-500 text-xs text-center font-bold">
          Error al cargar el componente 3D o la escena.
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
