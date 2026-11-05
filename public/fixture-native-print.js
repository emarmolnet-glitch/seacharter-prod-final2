/* Native printing only: no screenshot, canvas, image encoding or PDF library. */
(function () {
    let activePreview;
    window.printFixtureRecap = function (html) {
        activePreview?.();
        const previousFocus = document.activeElement;
        const panel = document.createElement('div');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Vista de impresión del Fixture Recap');
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;flex-direction:column;color:#17212b';
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;padding:12px;border-bottom:1px solid #cbd5e1;background:#f8fafc';
        const print = document.createElement('button');
        print.type = 'button';
        print.textContent = 'Imprimir / Guardar como PDF';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Volver a Decisiones';
        toolbar.append(print, close);
        const frame = document.createElement('iframe');
        frame.title = 'Fixture Recap — documento de impresión';
        frame.style.cssText = 'width:100%;flex:1;min-height:0;border:0;background:white';
        panel.append(toolbar, frame);
        document.body.appendChild(panel);
        let printDocument;
        const onKey = event => {
            if (event.key === 'Escape') close.click();
            if (event.key === 'Tab' && event.target === close && !event.shiftKey) {
                event.preventDefault(); print.focus();
            } else if (event.key === 'Tab' && event.target === print && event.shiftKey) {
                event.preventDefault(); close.focus();
            }
        };
        const cleanup = () => {
            document.removeEventListener('keydown', onKey);
            printDocument?.removeEventListener('keydown', onKey);
            panel.remove();
            activePreview = null;
            previousFocus?.focus();
        };
        close.onclick = cleanup;
        activePreview = cleanup;
        document.addEventListener('keydown', onKey);
        try {
            const doc = frame.contentDocument;
            doc.open();
            doc.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture Recap</title></head><body></body></html>');
            doc.close();
            printDocument = doc;
            doc.addEventListener('keydown', onKey);
            const style = doc.createElement('style');
            style.textContent = `
                @page { size: A4 portrait; margin: 14mm; }
                * { box-sizing: border-box; }
                body { margin: 0; color: #0f172a; background: white; font: 9.5pt/1.55 'Courier New', monospace; }
                main { max-width: 190mm; margin: auto; padding: 20px; }
                p { margin: 0 0 8px; orphans: 3; widows: 3; }
                h1,h2,h3,h4,h5,summary { margin: 0 0 10px; line-height: 1.3; font-weight: 800; break-after: avoid; page-break-after: avoid; }
                h1 { font-size: 17pt; } h2 { font-size: 14pt; } h3 { font-size: 12pt; }
                h4,h5,summary { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .04em; }
                h1,h2,h3 { padding-bottom: 10px; border-bottom: 2px solid #334155; }
                table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 8pt; line-height: 1.45; break-inside: avoid; page-break-inside: avoid; }
                th,td { border: 1px solid #94a3b8; padding: 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
                th { background: #334155; color: #fff; font-weight: 700; }
                td { background: #fff; }
                tbody tr:nth-child(even) td { background: #f1f5f9; }
                thead { display: table-header-group; }
                tfoot { display: table-footer-group; }
                tr { break-inside: avoid; page-break-inside: avoid; }
                .native-recap-header { border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; break-inside: avoid; }
                .native-recap-header > div:first-child { font-weight: 800; font-size: 11pt; letter-spacing: .04em; margin-bottom: 8px; }
                .native-recap-footer { border-top: 2px solid #334155; padding-top: 12px; margin-top: 20px; text-align: center; font-weight: 700; break-inside: avoid; }
                .recap-section { margin: 20px 0; padding: 14px; border: 1px solid #94a3b8; border-left: 4px solid #334155; border-radius: 4px; background: #f8fafc; break-inside: avoid; page-break-inside: avoid; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
                .recap-title { padding: 0 0 8px; margin-bottom: 12px; border-bottom: 1px solid #94a3b8; }
                .recap-list { list-style: none; padding: 0; margin: 0; }
                .recap-field,.recap-meta-row { display: table; width: 100%; margin-bottom: 7px; break-inside: avoid; page-break-inside: avoid; }
                .recap-field-label { display: table-cell; width: 27%; padding-right: 12px; font-weight: 700; vertical-align: top; }
                .recap-field-value { display: table-cell; overflow-wrap: anywhere; }
                .fixture-executive-appendix { break-before: page; page-break-before: always; font-family: Verdana, sans-serif; font-size: 9pt; }
                .native-executive-header { padding: 18px; margin-bottom: 20px; background: #f1f5f9; border-top: 4px solid #0f172a; border-bottom: 2px solid #94a3b8; break-inside: avoid; }
                .native-executive-body > * { margin-bottom: 20px; }
                .native-card, .native-clauses, .fixture-executive-appendix details { padding: 14px; border: 1px solid #94a3b8; border-radius: 4px; background: #f8fafc; break-inside: avoid; page-break-inside: avoid; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
                .native-card h5,.native-stowage h4,.native-clauses h4 { border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; color: #1e3a5f; }
                .native-offer { border: 1px solid #6b9c8c; border-left: 4px solid #276653; background: #f0f8f4; }
                .native-offer h5 { color: #205543; }
                .native-offer li { padding: 10px; margin-top: 8px; background: #e7f3ec; border: 1px solid #b4d1c0; }
                .native-stowage { padding: 14px; border: 1px solid #94a3b8; border-radius: 4px; background: #fff; }
                .native-stowage .visual-stowage-plan-wrapper { border: 0; padding: 0; }
                .native-clauses li { margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
                .fixture-executive-appendix ul { margin: 8px 0 0; padding-left: 18px; }
                .native-card > ul { list-style: none; padding-left: 0; }
                .native-card li { margin-bottom: 6px; }
                .fixture-executive-appendix .font-bold, .fixture-executive-appendix .font-black { font-weight: 700; }
                .fixture-executive-appendix li.flex { display: flex; justify-content: space-between; gap: 12px; }
                .grid { display: grid; gap: 16px; align-items: start; }
                .grid-cols-2, [class~="md:grid-cols-2"] { grid-template-columns: repeat(2,minmax(0,1fr)); }
                details { display: block; }
                summary { list-style: none; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; }
                svg { display: block; width: 100%; max-width: 100%; height: auto; break-inside: avoid; }
                @media print {
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    main { max-width: none; padding: 0; }
                    div,section,details { overflow: visible; max-height: none; }
                    .fixture-executive-appendix,.native-executive-body,.native-stowage { break-inside: auto; page-break-inside: auto; }
                }
                @media screen and (max-width: 600px) { .grid { display: block; } .grid > * { margin-bottom: 16px; } }
            `;
            doc.head.appendChild(style);
            const template = doc.createElement('template');
            template.innerHTML = html;
            // Keep native SVG vectors; strip executable content and rasterized snapshots.
            template.content.querySelectorAll('script,style,link,meta,iframe,object,embed,img,canvas,foreignObject,video,audio,button,input,select,textarea,.no-print,[data-stowage-legend]').forEach(node => node.remove());
            // Add stable print hooks before stripping IDs and inline styles.
            // Works with previously approved HTML as well as freshly rendered reports.
            template.content.querySelectorAll('.recap-section').forEach(section => {
                const recap = section.parentElement;
                recap.firstElementChild?.classList.add('native-recap-header');
                recap.lastElementChild?.classList.add('native-recap-footer');
            });
            const blocks = {
                'executive-net-results-column': 'native-offer',
                'executive-visual-stowage-section': 'native-stowage',
                'executive-stipulated-clauses': 'native-clauses',
                'executive-madre-recap': 'native-clauses',
            };
            for (const [id, className] of Object.entries(blocks)) {
                template.content.querySelectorAll(`[id="${id}"]`).forEach(node => node.classList.add(className));
            }
            template.content.querySelectorAll('.fixture-executive-appendix > div').forEach(report => {
                report.firstElementChild?.classList.add('native-executive-header');
                report.children[1]?.classList.add('native-executive-body');
            });
            template.content.querySelectorAll('.fixture-executive-appendix .grid > div').forEach(card => {
                if (card.classList.contains('border')) card.classList.add('native-card');
            });
            const allowed = new Set(['DIV','SECTION','MAIN','HEADER','FOOTER','H1','H2','H3','H4','H5','H6','P','SPAN','STRONG','B','EM','I','SMALL','BR','HR','UL','OL','LI','TABLE','THEAD','TBODY','TFOOT','TR','TH','TD','CAPTION','DETAILS','SUMMARY']);
            const vectorTags = new Set(['SVG','G','PATH','RECT','TEXT','LINE','POLYGON','POLYLINE','DEFS','CLIPPATH','PATTERN','CIRCLE','LINEARGRADIENT','STOP']);
            const vectorAttributes = new Set([
                'xmlns','viewbox','width','height','fill','fill-opacity','fill-rule','stroke','stroke-width',
                'stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset',
                'transform','id','d','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','points','opacity',
                'clip-path','clip-rule','clippathunits','patternunits','patterncontentunits','patterntransform',
                'gradientunits','gradienttransform','offset','stop-color','stop-opacity',
                'font-size','font-family','font-weight','text-anchor','dominant-baseline','alignment-baseline',
                'textlength','lengthadjust','preserveaspectratio','vector-effect',
            ]);
            template.content.querySelectorAll('*').forEach(node => {
                if (node.classList.contains('print:hidden') || node.classList.contains('hidden')) { node.remove(); return; }
                const tag = node.localName.toUpperCase();
                const vector = node.namespaceURI === 'http://www.w3.org/2000/svg';
                if (!(vector ? vectorTags : allowed).has(tag)) { node.replaceWith(...node.childNodes); return; }
                for (const attribute of Array.from(node.attributes)) {
                    const name = attribute.name.toLowerCase();
                    const permitted = ['class','colspan','rowspan','scope','lang'].includes(name) || (vector && vectorAttributes.has(name));
                    // Paint servers and clipping may refer only to definitions in this SVG.
                    const externalPaint = /url\s*\(/i.test(attribute.value) && !/^url\(\s*#[\w.-]+\s*\)$/i.test(attribute.value);
                    if (!permitted || externalPaint) node.removeAttribute(attribute.name);
                }
                if (node.tagName === 'DETAILS') node.setAttribute('open', '');
            });
            const content = doc.createElement('main');
            content.appendChild(template.content);
            doc.body.appendChild(content);
            // This frame isolates styles only. Native print replaces all canvas/PDF work.
            print.onclick = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
            print.focus();
            print.click();
        } catch (error) {
            cleanup();
            throw error;
        }
    };
})();
