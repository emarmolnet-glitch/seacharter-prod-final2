import React from 'react';
import { createRoot } from 'react-dom/client';
import { GlobalMadreDrawer } from './components/GlobalMadreDrawer';

function mountMadreDrawer() {
  let container = document.getElementById('global-madre-drawer-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-madre-drawer-root';
    document.body.appendChild(container);
  }
  const root = createRoot(container);
  root.render(<GlobalMadreDrawer />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountMadreDrawer);
} else {
  mountMadreDrawer();
}
