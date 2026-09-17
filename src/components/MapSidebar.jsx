import React from 'react';
import { GeographicInput } from './GeographicInput.jsx';

/**
 * MapSidebar Component
 * Alias container component for GeographicInput providing the collapsible
 * left-hand geographic configuration panel on the 3D globe map.
 */
export function MapSidebar(props) {
  return <GeographicInput {...props} />;
}

export { GeographicInput };
export default MapSidebar;
