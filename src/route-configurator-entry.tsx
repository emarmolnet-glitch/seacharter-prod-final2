import React from "react";
import { createRoot } from "react-dom/client";
import RouteConfigurator from "./components/RouteConfigurator";

interface RouteConfiguratorErrorBoundaryState {
  hasError: boolean;
}

class RouteConfiguratorErrorBoundary extends React.Component<React.PropsWithChildren, RouteConfiguratorErrorBoundaryState> {
  state: RouteConfiguratorErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RouteConfiguratorErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[RouteConfigurator] React render failed.", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          El configurador de ruta no pudo cargarse. El resto de Core PRO continúa disponible.
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById("route-configurator-root");

if (container) {
  createRoot(container).render(
    <RouteConfiguratorErrorBoundary>
      <RouteConfigurator />
    </RouteConfiguratorErrorBoundary>,
  );
}
