import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  declare props: Readonly<Props>;
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  handleRefresh = (): void => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-6">
          <div className="bg-white border border-brand-black/10 rounded-xl p-10 max-w-md shadow-sm">
            <p className="text-brand-black font-semibold text-lg mb-2">
              This section is temporarily unavailable.
            </p>
            <p className="text-brand-gray text-sm mb-6">
              Refresh to try again.
            </p>
            <button
              onClick={this.handleRefresh}
              className="bg-brand-rose hover:bg-brand-rose/80 text-white font-semibold text-sm rounded-full px-6 py-3 transition-all active:scale-95"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
