import {Component, StrictMode, type ErrorInfo, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __sysmindStartupError?: (message: unknown) => void;
  }
}

type StartupErrorBoundaryProps = {
  children: ReactNode;
};

type StartupErrorBoundaryState = {
  error: Error | null;
};

class StartupErrorBoundary extends Component<StartupErrorBoundaryProps, StartupErrorBoundaryState> {
  state: StartupErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StartupErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SysMind render failed:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ boxSizing: 'border-box', minHeight: '100vh', padding: 32, font: '14px/1.55 system-ui, sans-serif', color: '#7f1d1d', background: '#fff7ed' }}>
          <h1 style={{ margin: '0 0 12px', fontSize: 20 }}>SysMind failed to start</h1>
          <p style={{ margin: '0 0 16px' }}>The desktop app could not render its interface. Error details:</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 16, background: '#fff', border: '1px solid #fed7aa', borderRadius: 6 }}>
            {this.state.error.stack || this.state.error.message}
          </pre>
        </main>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');

try {
  if (!rootElement) throw new Error('The application root element is missing.');
  rootElement.dataset.appMounted = 'true';
  createRoot(rootElement).render(
    <StrictMode>
      <StartupErrorBoundary>
        <App />
      </StartupErrorBoundary>
    </StrictMode>,
  );
} catch (error) {
  rootElement?.removeAttribute('data-app-mounted');
  window.__sysmindStartupError?.(error instanceof Error ? error.stack || error.message : error);
}
