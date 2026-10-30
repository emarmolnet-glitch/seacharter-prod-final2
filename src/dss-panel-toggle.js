export function initializeDssPanel(root) {
    const toggle = root.querySelector('#dss-panel-toggle');
    const content = root.querySelector('#dss-panel-content');
    if (!toggle || !content || toggle.dataset.initialized === 'true') return;

    toggle.dataset.initialized = 'true';
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', `${expanded ? 'Plegar' : 'Desplegar'} Sistema de Soporte de Decisiones (DSS)`);
        toggle.title = `${expanded ? 'Plegar' : 'Desplegar'} DSS`;
        content.classList.toggle('dss-panel-content--collapsed', !expanded);
        content.inert = !expanded;
        content.setAttribute('aria-hidden', String(!expanded));
    });
}
