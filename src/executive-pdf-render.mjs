// Flatten only the exported schematic. Browser UI and financial state are untouched.
export async function prepareExecutivePDF(report) {
  const schematic = report.querySelector('.visual-stowage-plan-wrapper');
  if (!schematic) return;
  // Interactive key is redundant with the schematic and technical table. Remove
  // it before layout conversion so table/block overrides cannot paint it twice.
  schematic.querySelectorAll('[data-stowage-legend]').forEach(legend => legend.remove());
  schematic.style.cssText += ';display:block;width:100%;box-sizing:border-box;padding:12px;overflow:visible';
  schematic.querySelectorAll('div').forEach(node => {
    if (node.classList.contains('grid')) {
      node.style.cssText += ';display:table;width:100%;table-layout:fixed';
      Array.from(node.children).forEach(child => {
        child.style.cssText += `;display:table-cell;width:${100 / node.children.length}%;vertical-align:top;white-space:normal`;
      });
    } else if (node.classList.contains('flex')) {
      node.style.cssText += ';display:block;width:100%;white-space:normal';
    }
    node.style.overflow = 'visible';
  });
  schematic.querySelectorAll('table').forEach(table => {
    table.style.cssText += ';width:100%;table-layout:fixed;border-collapse:collapse';
    table.querySelectorAll('th,td').forEach(cell => {
      cell.style.cssText += ';display:table-cell;white-space:normal;overflow-wrap:break-word;padding:6px;font-size:10px';
    });
  });
  // Native SVG rasterization preserves x/y, anchors, gradients and hatch patterns.
  // html2canvas receives a simple PNG rather than reinterpreting SVG text with page CSS.
  for (const original of schematic.querySelectorAll('svg')) {
    const svg = original.cloneNode(true);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '1000');
    svg.setAttribute('height', '320');
    svg.setAttribute('viewBox', '0 0 1000 320');
    svg.removeAttribute('class');
    svg.removeAttribute('style');
    svg.querySelectorAll('[class]').forEach(node => node.removeAttribute('class'));
    // Long generated tier labels must stay inside their own hold.
    svg.querySelectorAll('text').forEach(text => {
      const group = text.parentElement;
      const hold = group?.closest('g')?.parentElement;
      const box = hold?.querySelector('rect');
      const width = Number(box?.getAttribute('width'));
      const fontSize = Number(text.getAttribute('font-size') || 10);
      const estimate = (text.textContent || '').length * fontSize * 0.6;
      if (width > 50 && width < 400 && estimate > width - 20) {
        text.setAttribute('textLength', String(width - 20));
        text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Unable to render vessel schematic for PDF'));
        image.src = url;
      });
      const canvas = report.ownerDocument.createElement('canvas');
      canvas.width = 2000;
      canvas.height = 640;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable for vessel schematic');
      context.drawImage(image, 0, 0, 2000, 640);
      const png = report.ownerDocument.createElement('img');
      png.src = canvas.toDataURL('image/png');
      png.alt = 'Stowage plan and vessel schematic';
      png.width = 1000;
      png.height = 320;
      png.style.cssText = 'display:block;width:100%;height:auto;max-width:100%;position:static';
      original.replaceWith(png);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
