/* EL MOTOR DE MARCA (src/tenant/branding.js) — corte 6.
 *
 * Pinta Store.brand() sobre la página actual. Se llama —sincrónico— desde el <head> de cada página,
 * justo después de store.js, para que las variables CSS, el <link> de las fuentes, el <style> del
 * modo de color vigente y el título ya estén bien ANTES de la primera pintura. Los logos y el texto
 * [data-brand-name] viven en el body, que todavía no existe a esa altura: se cambian en
 * DOMContentLoaded, y mientras un override los vaya a tocar la página los mantiene escondidos
 * (data-brand-pending) para que el valor del pack no parpadee primero.
 *
 * Sin override efectivo es un no-op: no se toca nada y la página queda como la renderizó
 * tools/generate.mjs. Una vez aplicado algo, una llamada posterior sin overrides (reset) devuelve los
 * valores del pack quitando las propiedades en línea otra vez.
 *
 * Las reglas de color (kebab, hexToRgb/rgbToHex, normHex y los alias de :root) se ESPEJAN como en
 * store.js —que las usa para Store— y como CORE_VAR_ALIASES en tools/generate.mjs: si cambia una,
 * cambian las tres. Los valores por defecto salen de `Store.brandDefaults()` (el pack), nunca de una
 * copia privada.
 */
const Brand = {
  _active: false,
  _base: null,
  _domHooked: false,

  apply: function (brand) {
    var doc = document;
    if (!doc) return false;
    var b = brand || Store.brand();
    var o = b.overridden;
    var active = o.companyName || o.colors || o.logos || o.fonts || o.headerVariant;
    if (!active && !Brand._active) return false;
    Brand._active = !!active;
    var root = doc.documentElement;
    if (!Brand._base) {
      Brand._base = { title: doc.title, watermark: window.getComputedStyle(root).getPropertyValue('--print-watermark').trim() };
    }
    applyBrandColors(b, root);
    applyBrandFonts(b, doc, root);
    each(doc.querySelectorAll('style[data-color-mode]'), function (s) {
      var media = s.getAttribute('data-color-mode') === b.headerVariant ? 'all' : 'not all';
      if (s.getAttribute('media') !== media) s.setAttribute('media', media);
    });
    doc.title = o.companyName ? swapBrandName(Brand._base.title, b.companyName) : Brand._base.title;

    if (doc.readyState === 'loading') {
      if (o.companyName || o.logos || o.headerVariant) {
        if (!doc.getElementById('brandPendingStyle')) {
          var st = doc.createElement('style');
          st.id = 'brandPendingStyle';
          st.textContent = 'html[data-brand-pending] [data-brand-logo],html[data-brand-pending] [data-brand-name]{visibility:hidden}';
          (doc.head || root).appendChild(st);
        }
        root.setAttribute('data-brand-pending', '');
      }
      if (!Brand._domHooked) {
        Brand._domHooked = true;
        doc.addEventListener('DOMContentLoaded', function () {
          /* El finally no es decorativo: data-brand-pending esconde el logo y
           * el nombre para que no parpadee el valor del pack. Si applyBrandDom
           * fallara, sin esto quedarían ocultos para siempre. */
          try { applyBrandDom(Store.brand()); }
          finally { root.removeAttribute('data-brand-pending'); }
        });
      }
    } else {
      applyBrandDom(b);
    }
    return true;
  }
};

function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }

/* Los mismos nombres que tools/generate.mjs emite en el :root de cada página (allá CORE_VAR_ALIASES):
 * tres claves del núcleo se escriben distinto en cada página. */
const BRAND_VAR_ALIASES = {
  inkSecondary: ['--ink-2', '--ink2'],
  goldLight: ['--gold-light', '--gold2'],
  success: ['--success', '--green']
};

const kebab = function (s) { return String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); };

/* Espejo de los de store.js (los usa para Store); mismos números, misma regla. */
function hexToRgb(hex) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb) {
  return '#' + rgb.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join('');
}
function normHex(hex) { return rgbToHex(hexToRgb(hex)); }

function brandVarEntries(colors) {
  var out = [];
  Object.keys(colors).forEach(function (k) {
    if (k === 'tints' || k === 'rgb') return;
    (BRAND_VAR_ALIASES[k] || ['--' + kebab(k)]).forEach(function (n) { out.push([n, colors[k]]); });
  });
  out.push(['--rgb-accent', hexToRgb(colors.accent).join(',')]);
  Object.keys(colors.tints || {}).forEach(function (k) { out.push(['--tint-' + kebab(k), colors.tints[k]]); });
  Object.keys(colors.rgb || {}).forEach(function (k) { out.push(['--rgb-' + kebab(k), colors.rgb[k]]); });
  return out;
}

function applyBrandColors(b, root) {
  var on = b.overridden.colors;
  brandVarEntries(on ? b.colors : Store.brandDefaults().colors).forEach(function (e) {
    if (on) root.style.setProperty(e[0], e[1]); else root.style.removeProperty(e[0]);
  });
  /* The watermark is an SVG data URI (var() cannot reach inside it): its
   * only color is the %23rrggbb fill, rebuilt from the default value. */
  if (on && Brand._base.watermark) {
    root.style.setProperty('--print-watermark', Brand._base.watermark.replace(/%23[0-9a-fA-F]{3,6}/, '%23' + normHex(b.colors.inkSecondary).slice(1)));
  } else {
    root.style.removeProperty('--print-watermark');
  }
}

function applyBrandFonts(b, doc, root) {
  var link = doc.querySelector('link[data-brand-fonts]');
  if (link && link.getAttribute('href') !== b.fonts.href) link.setAttribute('href', b.fonts.href);
  if (b.overridden.fonts) {
    root.style.setProperty('--font-body', b.fonts.body);
    root.style.setProperty('--font-heading', '"' + b.fonts.headingName + '",' + b.fonts.headingFallback);
  } else {
    root.style.removeProperty('--font-body');
    root.style.removeProperty('--font-heading');
  }
}

function applyBrandDom(b) {
  var doc = document;
  var slot = b.headerVariant === 'inverted' ? 'onLight' : 'onDark';
  each(doc.querySelectorAll('img[data-brand-logo]'), function (img) {
    if (!img.hasAttribute('data-brand-alt')) img.setAttribute('data-brand-alt', img.getAttribute('alt') || '');
    var src = b.logos[slot] || b.logos.onDark || b.logos.onLight;
    if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    if (img.getAttribute('data-brand-logo') !== slot) img.setAttribute('data-brand-logo', slot);
    var base = img.getAttribute('data-brand-alt');
    var alt = b.overridden.companyName ? swapBrandName(base, b.companyName) : base;
    if (img.getAttribute('alt') !== alt) img.setAttribute('alt', alt);
  });
  each(doc.querySelectorAll('[data-brand-name]'), function (el) {
    if (!el.hasAttribute('data-brand-base')) el.setAttribute('data-brand-base', el.textContent);
    var t = b.overridden.companyName ? b.companyName : el.getAttribute('data-brand-base');
    if (el.textContent !== t) el.textContent = t;
  });
  each(doc.querySelectorAll('[data-brand-label]'), function (el) {
    if (!el.hasAttribute('data-brand-label-base')) el.setAttribute('data-brand-label-base', el.getAttribute('aria-label') || '');
    var base = el.getAttribute('data-brand-label-base');
    el.setAttribute('aria-label', b.overridden.companyName ? swapBrandName(base, b.companyName) : base);
  });
}

/* Replaces the pack's name inside a generated string (title, alt text,
 * aria-label): displayName first, then shortName ("Asistente Macizo"). */
function swapBrandName(str, name) {
  var s = String(str || '');
  var d = Store.brandDefaults();
  var from = [d.companyName, d.shortName].filter(function (n) { return n && s.indexOf(n) >= 0; })[0];
  return from ? s.split(from).join(name) : s;
}

window.Brand = Brand;
