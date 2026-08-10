import { ComtradeCompetitivenessRadar } from './components/ComtradeCompetitivenessRadar';

function mountComtradeRadar(): void {
  const root = document.getElementById('comtrade-competitiveness-radar');
  if (!root || root.dataset.mounted === 'true') return;
  root.dataset.mounted = 'true';
  ComtradeCompetitivenessRadar(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountComtradeRadar, { once: true });
} else {
  mountComtradeRadar();
}
