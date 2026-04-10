/* =============================================================================
   harrison@portfolio — state machine, typing engine, hash router
   ============================================================================= */

(() => {
  'use strict';

  const SCREEN = document.getElementById('screen');
  const PROMPT = 'harrison@portfolio:~$ ';
  const TYPE_SPEED = 28;
  const TYPE_JITTER = 0.3;
  const INACTIVITY_RESUME_MS = 15000;
  const BOOT_URL = 'open https://dudeitsharrison.github.io';

  const SECRETS_KEY = 'portfolio:found-secrets';
  const loadFoundSecrets = () => {
    try {
      const raw = localStorage.getItem(SECRETS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  };
  const saveFoundSecrets = () => {
    try { localStorage.setItem(SECRETS_KEY, JSON.stringify([...state.foundSecrets])); }
    catch {}
  };

  const state = {
    data: null,
    view: 'boot',           // 'boot' | 'home' | 'folder' | 'project' | 'error'
    category: null,
    project: null,
    bootDone: false,
    typing: { active: false, skip: false, resolve: null },
    pinned: { index: 0, locked: false, lockTimer: null, rotateTimer: null },
    foundSecrets: loadFoundSecrets(),
  };

  // --- Small DOM helpers -------------------------------------------------------

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  };

  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Build a logo element for a project. Uses proj.logo (image path) if present,
  // otherwise falls back to a single-letter text icon using the first letter of the name.
  // size = 'sm' | 'md' | 'lg'
  const makeLogo = (proj, size = 'sm') => {
    const wrap = h('span', { class: `logo ${size}`, 'aria-hidden': 'true' });
    if (proj.logo) {
      wrap.appendChild(h('img', { src: proj.logo, alt: '' }));
    } else {
      const letter = (proj.name || '?').trim().charAt(0).toUpperCase();
      wrap.classList.add('filled');
      wrap.textContent = letter;
    }
    return wrap;
  };

  // --- Typing engine -----------------------------------------------------------

  function typeInto(element, text, speedMs = TYPE_SPEED) {
    return new Promise((resolve) => {
      state.typing.active = true;
      state.typing.skip = false;
      state.typing.resolve = resolve;

      let i = 0;
      const step = () => {
        if (!state.typing.active) return;
        if (state.typing.skip) {
          element.textContent = text;
          finish();
          return;
        }
        element.textContent = text.slice(0, ++i);
        if (i >= text.length) { finish(); return; }
        const jitter = 1 + (Math.random() * 2 - 1) * TYPE_JITTER;
        setTimeout(step, Math.max(4, speedMs * jitter));
      };

      const finish = () => {
        state.typing.active = false;
        state.typing.skip = false;
        state.typing.resolve = null;
        resolve();
      };

      step();
    });
  }

  // skip typing on any click or keypress
  const skipTyping = () => {
    if (state.typing.active) state.typing.skip = true;
  };
  document.addEventListener('keydown', skipTyping);
  document.addEventListener('click', skipTyping, true);

  // focus the terminal field on any non-interactive click
  document.addEventListener('click', (e) => {
    if (e.target.closest('a, button, input, textarea, select, [tabindex], .lightbox, .crumbs, .dir .row, .pin-list button, .spotlight .sp-cta')) return;
    const field = document.querySelector('.term-field');
    if (field && document.activeElement !== field) field.focus({ preventScroll: true });
  });

  // route keystrokes into the terminal field even when focus is elsewhere
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return; // only printable single-char keys
    const field = document.querySelector('.term-field');
    if (!field) return;
    field.focus({ preventScroll: true });
    field.value = field.value + e.key;
    field.closest('.term-input')?.classList.remove('is-empty');
    e.preventDefault();
  });

  // --- Breadcrumb --------------------------------------------------------------

  function renderCrumbs() {
    const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'breadcrumb' });

    // Back button — only show when not on home
    if (state.view !== 'home') {
      const backBtn = h('button', {
        class: 'back-btn',
        'aria-label': 'Go back',
        onclick: () => { history.back(); },
      });
      backBtn.innerHTML = '&#9664;';
      crumbs.appendChild(backBtn);
    }

    const add = (label, href, current = false) => {
      const span = h('span', {
        class: current ? 'crumb current' : 'crumb',
        text: label,
        tabindex: current ? null : '0',
        onclick: current ? null : (e) => { e.preventDefault(); navigate(href); },
        onkeydown: current ? null : (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(href); }
        },
      });
      crumbs.appendChild(span);
    };
    const sep = () => crumbs.appendChild(h('span', { class: 'sep', text: ' / ' }));

    const isHome = state.view === 'home';
    add('~', '#/', isHome);

    if (state.view === 'folder' && state.category) {
      sep();
      const cat = state.data.categories[state.category];
      add(cat ? cat.name.toLowerCase().replace(/\s+/g, '-') : state.category, `#/${state.category}`, true);
    } else if (state.view === 'project' && state.project) {
      const proj = state.data.projects[state.project];
      const catId = proj ? proj.category : state.category;
      if (catId) {
        sep();
        const cat = state.data.categories[catId];
        add(cat ? cat.name.toLowerCase().replace(/\s+/g, '-') : catId, `#/${catId}`, false);
      }
      sep();
      add(state.project, `#/${catId}/${state.project}`, true);
    }
    return crumbs;
  }

  // --- Prompt line with typed command -----------------------------------------

  function promptLine(command, { instant = false } = {}) {
    const line = h('div', { class: 'prompt-line' },
      h('span', { class: 'prompt-prefix', text: PROMPT }),
    );
    const cmd = h('span', { class: 'prompt-cmd' });
    line.appendChild(cmd);
    const cursor = h('span', { class: 'cursor', text: '█' });
    line.appendChild(cursor);
    if (instant) {
      cmd.textContent = command;
      return { line, typePromise: Promise.resolve(), cursor };
    }
    const typePromise = typeInto(cmd, command);
    return { line, typePromise, cursor };
  }

  // --- Brand / header ----------------------------------------------------------

  const BRAND_ASCII =
`╔══════════════════════════════════════════════════════════╗
║  H A R R I S O N · E N G L E    —   tools for efficiency ║
╚══════════════════════════════════════════════════════════╝`;

  function headerBlock() {
    const wrap = h('div');
    wrap.appendChild(h('pre', { class: 'brand', text: BRAND_ASCII }));
    if (state.data?.meta?.tagline) {
      wrap.appendChild(h('p', { class: 'brand-sub', text: '// ' + state.data.meta.tagline }));
    }
    return wrap;
  }

  // --- Boot screen -------------------------------------------------------------

  async function renderBoot() {
    state.view = 'boot';
    clear(SCREEN);
    SCREEN.classList.add('boot');

    const { line: l1, typePromise: p1 } = promptLine(BOOT_URL);
    SCREEN.appendChild(l1);
    await p1;
    l1.querySelector('.cursor')?.remove();

    await sleep(120);
    const l2 = h('div', { class: 'prompt-line' },
      h('span', { class: 'prompt-prefix', text: PROMPT }),
    );
    const l2cmd = h('span', { class: 'prompt-cmd' });
    l2.appendChild(l2cmd);
    l2.appendChild(h('span', { class: 'cursor', text: '█' }));
    SCREEN.appendChild(l2);
    await typeInto(l2cmd, 'Connected. Loading workspace...', 14);
    l2.querySelector('.cursor')?.remove();

    await sleep(150);
    SCREEN.classList.remove('boot');
    state.bootDone = true;
    termFocusPending = true;
    renderHome();
  }

  // --- Home screen -------------------------------------------------------------

  function renderHome() {
    state.view = 'home';
    state.category = null;
    state.project = null;
    clear(SCREEN);
    SCREEN.classList.remove('boot');

    SCREEN.appendChild(headerBlock());
    SCREEN.appendChild(renderCrumbs());
    SCREEN.appendChild(renderTerminal({ placeholder: 'type `help` and hit enter' }));

    // Pinned section
    const pinnedIds = (state.data.pinned || []).filter((id) => state.data.projects[id]);
    if (pinnedIds.length > 0) {
      SCREEN.appendChild(h('div', { class: 'section-label', text: '~/pinned/' }));
      SCREEN.appendChild(renderPinned(pinnedIds));
    }

    // Category listing — only populated categories are shown
    const cats = state.data.categories || {};
    const countFor = (catId) => Object.values(state.data.projects).filter((p) => p.category === catId).length;
    const catsWithProjects = Object.entries(cats).filter(([catId]) => countFor(catId) > 0);

    SCREEN.appendChild(h('div', { class: 'section-label', text: '~/' }));

    const list = h('ul', { class: 'dir panel' });
    // list all populated categories
    catsWithProjects.forEach(([catId, cat]) => {
      const n = countFor(catId);
      const row = h('a', {
        class: 'row',
        href: `#/${catId}`,
        tabindex: '0',
        onclick: (e) => { e.preventDefault(); navigate(`#/${catId}`); },
      },
        h('span', { class: 'icon', text: cat.icon || '📁' }),
        h('span', { class: 'name', text: cat.name + '/' }),
        h('span', { class: 'desc', text: `${cat.description || ''}  (${n})`.trim() }),
      );
      list.appendChild(h('li', {}, row));
    });
    SCREEN.appendChild(list);

    SCREEN.appendChild(renderSecretsSection());
    SCREEN.appendChild(footerBlock());
    stopPinnedRotation();
    if (pinnedIds.length > 1) startPinnedRotation(pinnedIds);
  }

  // --- Pinned spotlight --------------------------------------------------------

  function renderPinned(pinnedIds) {
    const wrap = h('div', { class: 'pinned-wrap panel' });
    const spotlight = h('div', { class: 'spotlight', id: 'spotlight' });
    wrap.appendChild(spotlight);

    const list = h('ul', { class: 'pin-list', id: 'pin-list' });
    pinnedIds.forEach((id, idx) => {
      const proj = state.data.projects[id];
      list.appendChild(h('li', {},
        h('button', {
          dataset: { pid: id, idx: String(idx) },
          class: idx === state.pinned.index ? 'active' : '',
          onclick: () => {
            if (state.pinned.index === idx) {
              navigate(`#/${proj.category}/${id}`);
              return;
            }
            state.pinned.index = idx;
            lockPinned();
            paintSpotlight(pinnedIds);
          },
          text: proj.name,
        })
      ));
    });
    wrap.appendChild(list);

    state.pinned.index = Math.min(state.pinned.index, pinnedIds.length - 1);
    // Paint immediately using the element reference (not getElementById,
    // which fails because wrap isn't in the DOM yet)
    paintSpotlight(pinnedIds, spotlight);
    return wrap;
  }

  function paintSpotlight(pinnedIds, spOverride) {
    const sp = spOverride || document.getElementById('spotlight');
    if (!sp) return;
    const id = pinnedIds[state.pinned.index];
    const proj = state.data.projects[id];
    if (!proj) return;

    clear(sp);
    sp.appendChild(h('span', { class: 'sp-meta', text: `pinned ${state.pinned.index + 1}/${pinnedIds.length}` }));

    const inner = h('div', { class: 'sp-inner' });
    const statusVal = proj.status || 'project';
    inner.appendChild(h('p', { class: 'sp-eyebrow' },
      document.createTextNode((state.data.categories[proj.category]?.name || proj.category) + ' · '),
      h('span', { class: 'status-badge status-' + statusVal, text: statusVal }),
    ));
    inner.appendChild(h('div', { class: 'sp-titlewrap' },
      makeLogo(proj, 'md'),
      h('h2', { class: 'sp-title', text: proj.name }),
    ));
    inner.appendChild(h('p', { class: 'sp-tag', text: proj.tagline || '' }));
    if (proj.highlights?.length) {
      const ul = h('ul', { class: 'sp-highlights' });
      proj.highlights.slice(0, 4).forEach((line) => {
        ul.appendChild(h('li', { text: line }));
      });
      inner.appendChild(ul);
    } else if (proj.reviews?.length) {
      const r = proj.reviews[0];
      inner.appendChild(h('p', { class: 'sp-review', text: '”' + r.quote + '”' }));
    }
    if (proj.screenshots?.length) {
      const thumbSrc = proj.screenshots[0];
      if (/\.(webm|mp4)$/i.test(thumbSrc)) {
        const vid = h('video', {
          class: 'sp-thumb',
          src: thumbSrc,
          autoplay: 'true', loop: 'true', muted: 'true', playsinline: 'true',
          style: 'visibility:hidden',
        });
        vid.addEventListener('loadeddata', () => { vid.style.visibility = 'visible'; });
        inner.appendChild(vid);
      } else {
        inner.appendChild(h('img', {
          class: 'sp-thumb',
          src: thumbSrc,
          alt: proj.name + ' screenshot',
          loading: 'eager',
        }));
      }
    }
    inner.appendChild(h('a', {
      class: 'sp-cta',
      href: `#/${proj.category}/${id}`,
      onclick: (e) => { e.preventDefault(); navigate(`#/${proj.category}/${id}`); },
      text: 'open →',
    }));
    sp.appendChild(inner);

    // reflect active button
    const listEl = document.getElementById('pin-list');
    if (listEl) {
      [...listEl.querySelectorAll('button')].forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.idx) === state.pinned.index);
      });
    }
  }

  function startPinnedRotation(pinnedIds) {
    stopPinnedRotation();
    const ms = state.data.meta?.pinned_rotation_ms || 6000;
    state.pinned.rotateTimer = setInterval(() => {
      if (state.view !== 'home') return;
      if (state.pinned.locked) return;
      state.pinned.index = (state.pinned.index + 1) % pinnedIds.length;
      paintSpotlight(pinnedIds);
    }, ms);
  }

  function stopPinnedRotation() {
    if (state.pinned.rotateTimer) clearInterval(state.pinned.rotateTimer);
    if (state.pinned.lockTimer) clearTimeout(state.pinned.lockTimer);
    state.pinned.rotateTimer = null;
    state.pinned.lockTimer = null;
    state.pinned.locked = false;
  }

  function lockPinned() {
    state.pinned.locked = true;
    if (state.pinned.lockTimer) clearTimeout(state.pinned.lockTimer);
    state.pinned.lockTimer = setTimeout(() => {
      state.pinned.locked = false;
    }, INACTIVITY_RESUME_MS);
  }

  // --- Folder view -------------------------------------------------------------

  async function renderFolder(catId, { animate = true } = {}) {
    state.view = 'folder';
    state.category = catId;
    state.project = null;

    const cat = state.data.categories[catId];
    if (!cat) { renderError(`No such directory: ${catId}`); return; }

    clear(SCREEN);
    SCREEN.appendChild(headerBlock());
    SCREEN.appendChild(renderCrumbs());
    SCREEN.appendChild(renderTerminal());

    const projects = Object.entries(state.data.projects).filter(([, p]) => p.category === catId);

    if (projects.length === 0) {
      SCREEN.appendChild(h('div', { class: 'panel muted', text: '(empty directory — nothing to list)' }));
    } else {
      const list = h('ul', { class: 'dir panel' });
      projects.forEach(([pid, p]) => {
        const row = h('a', {
          class: 'row',
          href: `#/${catId}/${pid}`,
          tabindex: '0',
          onclick: (e) => { if (!e.target.closest('.row-tag')) { e.preventDefault(); navigate(`#/${catId}/${pid}`); } },
        },
          makeLogo(p, 'sm'),
          h('span', { class: 'name', text: p.name }),
          h('span', { class: 'desc', text: p.tagline || '' }),
        );
        if (p.tags?.length) {
          const tagsRow = h('div', { class: 'row-tags' });
          p.tags.slice(0, 8).forEach((t) => {
            tagsRow.appendChild(h('span', {
              class: 'row-tag',
              text: '#' + t.replace(/\s+/g, ''),
              onclick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                const termField = document.querySelector('.term-field');
                if (termField) {
                  termField.value = 'tag ' + t;
                  termField.closest('form')?.dispatchEvent(new Event('submit'));
                }
              },
            }));
          });
          row.appendChild(tagsRow);
        }
        list.appendChild(h('li', {}, row));
      });
      SCREEN.appendChild(list);
    }

    SCREEN.appendChild(footerBlock());
    stopPinnedRotation();
  }

  // --- Project view ------------------------------------------------------------

  async function renderProject(projId, { animate = true } = {}) {
    const proj = state.data.projects[projId];
    if (!proj) { renderError(`No such file: ${projId}.md`); return; }
    state.view = 'project';
    state.project = projId;
    state.category = proj.category;

    clear(SCREEN);
    SCREEN.appendChild(headerBlock());
    SCREEN.appendChild(renderCrumbs());
    SCREEN.appendChild(renderTerminal());

    const body = h('article', { class: 'project panel' });
    const head = h('div', { class: 'head' },
      makeLogo(proj, 'lg'),
      h('div', { class: 'head-text' },
        h('h1', { text: proj.name }),
        proj.tagline ? h('p', { class: 'tagline', text: proj.tagline }) : null,
      ),
    );
    body.appendChild(head);

    if (proj.tags?.length) {
      const meta = h('div', { class: 'meta' });
      proj.tags.forEach((t) => meta.appendChild(h('span', { class: 'tag', text: t })));
      body.appendChild(meta);
    }

    const AVAILABILITY_LABELS = { wip: 'Work in progress', private: 'Source private', 'coming-soon': 'Coming soon' };
    const PROGRESS_LABELS = { core: 'Core', ui: 'UI / Design', stability: 'Stability', docs: 'Docs / Deploy' };
    const avLabel = proj.availability && AVAILABILITY_LABELS[proj.availability];

    // Description + progress side by side
    if (proj.description || proj.progress) {
      const row = h('div', { class: proj.progress ? 'desc-row' : '' });
      if (proj.description) row.appendChild(h('p', { class: 'desc', text: proj.description }));
      if (proj.progress) {
        const cats = Object.entries(proj.progress);
        const total = Math.round(cats.reduce((s, [, v]) => s + v, 0) / cats.length);
        const wrap = h('div', { class: 'progress-section' });
        wrap.appendChild(h('div', { class: 'progress-header' },
          h('span', { class: 'progress-label', text: (avLabel || 'Progress') + ' — ' + total + '%' }),
        ));
        const barOuter = h('div', { class: 'progress-bar' });
        barOuter.appendChild(h('div', { class: 'progress-fill', style: `width:${total}%` }));
        wrap.appendChild(barOuter);
        const breakdown = h('div', { class: 'progress-breakdown' });
        cats.forEach(([key, val]) => {
          const row2 = h('div', { class: 'progress-row' });
          row2.appendChild(h('span', { class: 'progress-cat', text: PROGRESS_LABELS[key] || key }));
          const miniBar = h('div', { class: 'progress-mini-bar' });
          miniBar.appendChild(h('div', { class: 'progress-mini-fill', style: `width:${val}%` }));
          row2.appendChild(miniBar);
          row2.appendChild(h('span', { class: 'progress-pct', text: val + '%' }));
          breakdown.appendChild(row2);
        });
        wrap.appendChild(breakdown);
        row.appendChild(wrap);
      }
      body.appendChild(row);
    }

    if (proj.reviews?.length) {
      body.appendChild(h('div', { class: 'section-label', text: '~/reviews/' }));
      const list = h('div', { class: 'reviews' });
      proj.reviews.forEach((r) => {
        const block = h('blockquote', { class: 'review' },
          h('span', { class: 'mark', text: '”' }),
          h('span', { class: 'quote', text: r.quote }),
          r.author ? h('span', { class: 'author', text: r.author }) : null,
        );
        list.appendChild(block);
      });
      body.appendChild(list);
    }

    const hasLinks = proj.links?.length;
    if (hasLinks || (avLabel && !proj.progress)) {
      const links = h('div', { class: 'links' });
      if (hasLinks) {
        proj.links.forEach((lnk) => {
          links.appendChild(h('a', {
            class: lnk.primary ? 'btn primary' : 'btn',
            href: lnk.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: lnk.label,
          }));
        });
      }
      if (avLabel && !proj.progress) {
        links.appendChild(h('span', { class: `badge badge-${proj.availability}`, text: avLabel }));
      }
      body.appendChild(links);
    }

    if (proj.screenshots?.length) {
      const shots = h('div', { class: 'shots' });
      proj.screenshots.forEach((src) => {
        const isVideo = /\.(webm|mp4)$/i.test(src);
        const isWide = /\.(gif|webm|mp4)$/i.test(src);
        if (isVideo) {
          const vid = h('video', {
            src, autoplay: 'true', loop: 'true', muted: 'true', playsinline: 'true',
            class: 'shot-video',
            style: 'visibility:hidden',
          });
          vid.addEventListener('loadeddata', () => { vid.style.visibility = 'visible'; });
          const wrap = h('div', {
            class: isWide ? 'shot wide' : 'shot',
            style: 'cursor:pointer',
            onclick: () => openLightbox(src, `${proj.name} video`),
          }, vid);
          shots.appendChild(wrap);
        } else {
          const img = h('img', { src, alt: `${proj.name} screenshot`, loading: 'lazy' });
          const link = h('a', {
            class: isWide ? 'shot wide' : 'shot',
            href: src,
            onclick: (e) => { e.preventDefault(); openLightbox(src, `${proj.name} screenshot`); },
          }, img);
          img.addEventListener('error', () => {
            const fallback = h('div', { class: 'shot-missing', text: `(missing: ${src})` });
            link.replaceWith(fallback);
          });
          shots.appendChild(link);
        }
      });
      body.appendChild(shots);
    }

    SCREEN.appendChild(body);
    SCREEN.appendChild(footerBlock());
    stopPinnedRotation();
  }

  // --- Lightbox ----------------------------------------------------------------

  function openLightbox(src, alt) {
    closeLightbox();
    const isVideo = /\.(webm|mp4)$/i.test(src);
    const media = isVideo
      ? h('video', { src, autoplay: 'true', loop: 'true', muted: 'true', playsinline: 'true', controls: 'true', style: 'max-width:90vw;max-height:90vh;' })
      : h('img', { src, alt });
    const box = h('div', {
      class: 'lightbox',
      id: 'lightbox',
      onclick: (e) => { if (e.target === box) closeLightbox(); },
    }, media);
    document.body.appendChild(box);
    const onKey = (e) => { if (e.key === 'Escape') closeLightbox(); };
    document.addEventListener('keydown', onKey);
    box.dataset.keyHandler = '1';
    box._onKey = onKey;
  }

  function closeLightbox() {
    const box = document.getElementById('lightbox');
    if (!box) return;
    if (box._onKey) document.removeEventListener('keydown', box._onKey);
    box.remove();
  }

  // --- Footer ------------------------------------------------------------------

  function footerBlock() {
    const m = state.data.meta || {};
    const foot = h('footer', { class: 'foot' });
    const left = h('div', {});
    if (m.contact_email) {
      left.appendChild(h('a', { href: `mailto:${m.contact_email}`, text: m.contact_email }));
    }
    foot.appendChild(left);
    const right = h('div', {});
    if (m.github) {
      right.appendChild(h('a', { href: m.github, target: '_blank', rel: 'noopener noreferrer', text: 'github' }));
    }
    foot.appendChild(right);
    return foot;
  }

  // --- Error state -------------------------------------------------------------

  function renderError(msg) {
    state.view = 'error';
    clear(SCREEN);
    SCREEN.appendChild(headerBlock());
    SCREEN.appendChild(renderCrumbs());
    SCREEN.appendChild(renderTerminal());
    SCREEN.appendChild(h('div', { class: 'error-box' },
      h('strong', { text: 'error: ' }),
      document.createTextNode(msg),
    ));
    SCREEN.appendChild(h('p', {},
      h('a', { href: '#/', onclick: (e) => { e.preventDefault(); navigate('#/'); }, text: 'cd ~' }),
    ));
    SCREEN.appendChild(footerBlock());
    stopPinnedRotation();
  }

  // --- Interactive terminal ----------------------------------------------------

  const cmdHistory = { list: [], index: 0 };
  let termFocusPending = false;

  function currentPath() {
    if (state.view === 'folder' && state.category) return `~/${state.category}`;
    if (state.view === 'project' && state.project) {
      const p = state.data.projects[state.project];
      return `~/${p?.category || '?'}/${state.project}`;
    }
    return '~';
  }

  function resolveTarget(token) {
    if (!token || token === '~' || token === '/') return { kind: 'home' };
    if (token === '..') {
      if (state.view === 'project') {
        const p = state.data.projects[state.project];
        return p ? { kind: 'category', id: p.category } : { kind: 'home' };
      }
      return { kind: 'home' };
    }
    if (token === '.') {
      if (state.view === 'folder') return { kind: 'category', id: state.category };
      if (state.view === 'project') return { kind: 'project', id: state.project };
      return { kind: 'home' };
    }
    const clean = token.replace(/\/$/, '').replace(/\.md$/, '');
    if (state.data.categories[clean]) return { kind: 'category', id: clean };
    if (state.data.projects[clean]) return { kind: 'project', id: clean };
    // fuzzy match on display names
    const lower = clean.toLowerCase();
    const projMatch = Object.entries(state.data.projects).find(([id, p]) =>
      id.toLowerCase() === lower || p.name.toLowerCase() === lower);
    if (projMatch) return { kind: 'project', id: projMatch[0] };
    const catMatch = Object.entries(state.data.categories).find(([id, c]) =>
      id.toLowerCase() === lower || c.name.toLowerCase() === lower);
    if (catMatch) return { kind: 'category', id: catMatch[0] };
    return null;
  }

  const COMMANDS = {};

  function addCmd(names, desc, run, { hidden = false } = {}) {
    const nameList = Array.isArray(names) ? names : [names];
    const entry = { name: nameList[0], desc, run, hidden };
    nameList.forEach((n) => { COMMANDS[n] = entry; });
  }

  addCmd('help', 'show available commands', () => {
    const visible = [];
    const seen = new Set();
    for (const c of Object.values(COMMANDS)) {
      if (c.hidden || seen.has(c.name)) continue;
      seen.add(c.name);
      visible.push(c);
    }
    const maxLen = Math.max(...visible.map((c) => c.name.length));
    const lines = ['available commands:'];
    visible.forEach((c) => lines.push('  ' + c.name.padEnd(maxLen + 2) + c.desc));
    lines.push('');
    lines.push('(a few hidden ones too. poke around.)');
    return { type: 'out', text: lines };
  });

  addCmd('ls', 'list directory contents', (args) => {
    let target;
    if (args[0]) target = resolveTarget(args[0]);
    else if (state.view === 'folder') target = { kind: 'category', id: state.category };
    else if (state.view === 'project') target = { kind: 'project', id: state.project };
    else target = { kind: 'home' };

    if (!target) return { type: 'err', text: `ls: cannot access '${args[0]}': no such file or directory` };

    if (target.kind === 'home') {
      const cats = Object.entries(state.data.categories).filter(([id]) =>
        Object.values(state.data.projects).some((p) => p.category === id));
      if (!cats.length) return { type: 'out', text: '(empty)' };
      return { type: 'out', text: cats.map(([id, c]) => `  ${c.icon || '📁'}  ${id}/`) };
    }
    if (target.kind === 'category') {
      const projs = Object.entries(state.data.projects).filter(([, p]) => p.category === target.id);
      if (!projs.length) return { type: 'out', text: '(empty directory)' };
      return { type: 'out', text: projs.map(([id, p]) => `  ›  ${id.padEnd(24)} ${p.tagline || ''}`) };
    }
    if (target.kind === 'project') {
      const p = state.data.projects[target.id];
      return { type: 'out', text: [
        `  name:      ${p.name}`,
        `  category:  ${p.category}`,
        `  status:    ${p.status || '—'}`,
        `  tagline:   ${p.tagline || ''}`,
      ]};
    }
    return { type: 'err', text: `ls: unknown target` };
  });

  addCmd(['up', '..'], 'go up one directory', () => {
    const target = resolveTarget('..');
    if (!target || target.kind === 'home' && state.view === 'home') {
      return { type: 'err', text: 'up: already at root' };
    }
    termFocusPending = true;
    if (target.kind === 'home') return { type: 'navigate', hash: '#/' };
    if (target.kind === 'category') return { type: 'navigate', hash: `#/${target.id}` };
    return { type: 'navigate', hash: '#/' };
  });

  addCmd(['home', '~', '/'], 'go to home (root)', () => {
    if (state.view === 'home') return { type: 'out', text: 'already home.' };
    termFocusPending = true;
    return { type: 'navigate', hash: '#/' };
  });

  addCmd('back', 'browser back (previous page)', () => {
    termFocusPending = true;
    history.back();
    return { type: 'out', text: '◂ back' };
  });

  addCmd('cd', 'change directory (cd ~, cd .., cd <name>)', (args) => {
    const arg = args[0] || '~';
    const target = resolveTarget(arg);
    if (!target) return { type: 'err', text: `cd: no such directory: ${arg}` };
    termFocusPending = true;
    if (target.kind === 'home') return { type: 'navigate', hash: '#/' };
    if (target.kind === 'category') return { type: 'navigate', hash: `#/${target.id}` };
    if (target.kind === 'project') {
      const p = state.data.projects[target.id];
      return { type: 'navigate', hash: `#/${p.category}/${target.id}` };
    }
    return { type: 'err', text: `cd: unknown target: ${arg}` };
  });

  addCmd('cat', 'view a project (cat <name>)', (args) => {
    if (!args[0]) return { type: 'err', text: 'cat: missing operand. try: cat snipboard' };
    const target = resolveTarget(args[0]);
    if (!target || target.kind !== 'project') return { type: 'err', text: `cat: ${args[0]}: no such file` };
    termFocusPending = true;
    const p = state.data.projects[target.id];
    return { type: 'navigate', hash: `#/${p.category}/${target.id}` };
  });

  addCmd('open', 'open a project or url', (args) => {
    if (!args[0]) return { type: 'err', text: 'open: missing operand' };
    const joined = args.join(' ');
    if (/^https?:\/\//i.test(joined)) return { type: 'open', url: joined };
    const target = resolveTarget(args[0]);
    if (target?.kind === 'project') {
      termFocusPending = true;
      const p = state.data.projects[target.id];
      return { type: 'navigate', hash: `#/${p.category}/${target.id}` };
    }
    if (target?.kind === 'category') {
      termFocusPending = true;
      return { type: 'navigate', hash: `#/${target.id}` };
    }
    return { type: 'err', text: `open: cannot resolve: ${joined}` };
  });

  addCmd('pwd', 'print current path', () => ({ type: 'out', text: currentPath() }));

  addCmd('clear', 'clear the terminal log', () => ({ type: 'clear' }));

  addCmd('whoami', 'about harrison', () => {
    const projects = Object.keys(state.data.projects).length;
    const live = Object.values(state.data.projects).filter((p) => p.status === 'live').length;
    return { type: 'html', text: `<div class="whoami">
<div class="whoami-name">harrison engle</div>
<div class="whoami-role">developer · AI-assisted engineering</div>
<div class="whoami-bio">I build the tools I wish existed. Most of my projects start as "I need this" and turn into something other people use too. My workflow: define the spec, spin up specialized AI agents, review every diff, handle edge cases, and stress-test before release. Think technical lead managing a team of junior engineers that happen to be Claude — architecting, orchestrating, shipping.</div>
<div class="whoami-stats">
  <span>${projects} projects</span> · <span>${live} shipped</span> · <span>windows, web, electron, react</span>
</div>
<div class="whoami-links">
  <span>email: ${state.data.meta?.contact_email || 'harrisonengle@gmail.com'}</span>
  <span>github: <a href="${state.data.meta?.github || '#'}" target="_blank">dudeitsharrison</a></span>
</div>
</div>` };
  });

  addCmd(['contact', 'email'], 'show contact email', () => {
    const email = state.data.meta?.contact_email || 'harrisonengle@gmail.com';
    return { type: 'out', text: `email: ${email}` };
  });

  addCmd('github', 'open github profile in a new tab', () => ({
    type: 'open',
    url: state.data.meta?.github || 'https://github.com/dudeitsharrison',
  }));

  addCmd('hire', 'compose a hiring email', () => {
    const email = state.data.meta?.contact_email || 'harrisonengle@gmail.com';
    const url = `mailto:${email}?subject=${encodeURIComponent('saw your site')}&body=${encodeURIComponent('hey harrison,\n\n')}`;
    return { type: 'open', url };
  });

  addCmd('buy', 'buy snipboard on gumroad', () => ({
    type: 'open',
    url: 'https://harrisonengle.gumroad.com/l/okjwv',
  }));

  addCmd('date', 'print current date and time', () => ({ type: 'out', text: new Date().toString() }));

  addCmd('echo', 'print text back', (args) => ({ type: 'out', text: args.join(' ') }));

  const FORTUNES = [
    'ship it.',
    'no build step is the best build step.',
    'the best code is the code you never had to write.',
    '"it works on my machine" is, technically, a shipped product.',
    'vanilla js is fine. it is going to be fine.',
    'you are not a framework. you are a person. go outside.',
    'every portfolio needs a terminal. this is law.',
    'if it compiles on the first try, something is wrong.',
  ];
  addCmd('fortune', 'dispense wisdom', () => ({
    type: 'out',
    text: '» ' + FORTUNES[Math.floor(Math.random() * FORTUNES.length)],
  }));

  addCmd(['exit', 'quit', 'logout'], 'try to leave (you cannot)', () => ({
    type: 'out',
    text: 'you can check out any time you like, but you can never leave.',
  }));

  addCmd(['tag', 'tags', '#'], 'filter by tag (tag react, tag #PWA)', (args) => {
    if (!args.length) {
      // List all unique tags with counts
      const tagMap = {};
      for (const p of Object.values(state.data.projects)) {
        (p.tags || []).forEach((t) => {
          const key = t.toLowerCase();
          if (!tagMap[key]) tagMap[key] = { name: t, count: 0 };
          tagMap[key].count++;
        });
      }
      const sorted = Object.values(tagMap).sort((a, b) => b.count - a.count);
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      let html = '<div class="search-results"><div class="search-header">all tags (' + sorted.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:6px 10px;">';
      sorted.forEach((t) => {
        html += `<span class="row-tag" style="font-size:12px;cursor:pointer;opacity:0.8;" onclick="document.querySelector('.term-field').value='tag ${esc(t.name)}';document.querySelector('.term-input').dispatchEvent(new Event('submit',{bubbles:true}))">#${esc(t.name.replace(/\\s+/g, ''))} <span style="opacity:0.5">(${t.count})</span></span>`;
      });
      html += '</div></div>';
      return { type: 'html', text: html };
    }
    const query = args.join(' ').replace(/^#/, '').toLowerCase();
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const matches = [];
    for (const [id, p] of Object.entries(state.data.projects)) {
      const hit = (p.tags || []).find((t) => t.toLowerCase().includes(query));
      if (hit) matches.push({ id, name: p.name, category: p.category, tag: hit, tagline: p.tagline || '' });
    }
    if (!matches.length) return { type: 'out', text: `no projects tagged "${query}"` };
    let html = `<div class="search-results"><div class="search-header">${matches.length} project${matches.length > 1 ? 's' : ''} tagged "<mark>${esc(query)}</mark>"</div>`;
    matches.forEach((m) => {
      html += `<div class="search-result"><a class="search-name" href="#/${m.category}/${m.id}">${esc(m.name)}</a> <span class="row-tag" style="font-size:11px;">#${esc(m.tag.replace(/\s+/g, ''))}</span><div class="search-match">${esc(m.tagline)}</div></div>`;
    });
    html += '</div>';
    return { type: 'html', text: html };
  });

  addCmd(['search', 'grep', 'find'], 'search projects (search <query>)', (args) => {
    const query = args.join(' ').trim();
    if (!query) return { type: 'err', text: 'usage: search <query>' };
    const q = query.toLowerCase();
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const highlight = (text, maxLen) => {
      const i = text.toLowerCase().indexOf(q);
      if (i === -1) return null;
      const start = Math.max(0, i - 40);
      const end = Math.min(text.length, i + q.length + 40);
      let snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
      // limit to one line
      snippet = snippet.replace(/\n/g, ' ');
      if (maxLen && snippet.length > maxLen) snippet = snippet.slice(0, maxLen) + '…';
      const escaped = esc(snippet);
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return escaped.replace(re, '<mark>$1</mark>');
    };

    const results = [];
    for (const [id, p] of Object.entries(state.data.projects)) {
      const fields = [
        { label: 'name', value: p.name || '' },
        { label: 'tagline', value: p.tagline || '' },
        { label: 'description', value: p.description || '' },
        { label: 'tags', value: (p.tags || []).join(', ') },
        { label: 'status', value: p.status || '' },
      ];
      const matches = [];
      for (const f of fields) {
        const h = highlight(f.value, 80);
        if (h) matches.push({ label: f.label, html: h });
      }
      if (matches.length) results.push({ id, name: p.name, category: p.category, matches });
    }

    if (!results.length) return { type: 'out', text: `no results for "${query}"` };

    let html = `<div class="search-results">`;
    html += `<div class="search-header">${results.length} project${results.length > 1 ? 's' : ''} matching "<mark>${esc(query)}</mark>"</div>`;
    for (const r of results) {
      html += `<div class="search-result">`;
      html += `<a class="search-name" href="#/${r.category}/${r.id}">${esc(r.name)}</a>`;
      for (const m of r.matches) {
        html += `<div class="search-match"><span class="search-field">${m.label}:</span> ${m.html}</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    return { type: 'html', text: html };
  });

  // --- Claude Code mode ---
  const CLAUDE_PROMPT = 'harrison> ';
  const claudeState = { active: false, tokens: 0, cost: 0, msgs: 0, startTime: 0 };

  const claudeResponses = [
    "I'll analyze the codebase structure first. Let me read the key files to understand the architecture before making any changes.",
    "Looking at this, I'd recommend refactoring the state management into a reducer pattern. Want me to proceed?",
    "I've identified 3 potential issues: a race condition in the async handler, an unguarded null access on line 42, and a missing error boundary. Let me fix all three.",
    "The test coverage for this module is at 34%. I'll write unit tests for the critical paths first, then we can expand from there.",
    "I can see the performance bottleneck — the component re-renders on every keystroke because the filter function creates a new array reference. Let me memoize it.",
    "I've scanned the project dependencies. Two packages have known CVEs — let me update them and verify nothing breaks.",
    "This function has O(n²) complexity because of the nested find(). I'll replace it with a Map lookup for O(n).",
    "The error handling here silently swallows exceptions. I'll add proper error boundaries and logging so failures surface in dev.",
    "Good question. The API returns stale data because the cache TTL is set to 5 minutes. We should either reduce it or add cache invalidation on writes.",
    "I'll set up the database migration first, then update the model layer, then adjust the API endpoints. Three files total.",
  ];
  const claudeErrors = [
    'Error: Your rate limit has been reached. Please wait 2 minutes before trying again.',
    'Error: Claude is at capacity right now. Please try again in a few moments.',
    'Error: Context window limit reached (1,000,000 tokens). Use /compact to reduce context.',
    'Error: Connection interrupted. Retrying in 5 seconds...',
    'Error: API key has exceeded its monthly spend limit. Check your plan at console.anthropic.com.',
  ];

  function enterClaudeMode(logEl) {
    claudeState.active = true;
    claudeState.tokens = 0;
    claudeState.cost = 0;
    claudeState.msgs = 0;
    claudeState.startTime = Date.now();
    // Update prompt prefix
    const prefix = document.querySelector('.term-input .prompt-prefix');
    if (prefix) prefix.textContent = CLAUDE_PROMPT;
    const field = document.querySelector('.term-field');
    if (field) field.placeholder = 'message claude... (/help for commands, /exit to quit)';
    const hint = document.querySelector('.term-hint');
    if (hint) hint.textContent = '/help · /compact · /cost · /status · /model · /exit or Esc to quit';
    // Boot animation
    const folder = currentPath();
    const entry = h('div', { class: 'entry' });
    let html = `<div class="claude-session">`;
    html += `<div class="claude-line" style="animation-delay:0ms"><span class="claude-dim">╭──────────────────────────────────────────────╮</span></div>`;
    html += `<div class="claude-line" style="animation-delay:100ms"><span class="claude-dim">│</span> <span class="claude-blue">Claude Code</span> <span class="claude-dim">v1.0.30 (claude-opus-4-6)</span>       <span class="claude-dim">│</span></div>`;
    html += `<div class="claude-line" style="animation-delay:200ms"><span class="claude-dim">╰──────────────────────────────────────────────╯</span></div>`;
    html += `<div class="claude-line" style="animation-delay:400ms"><span class="claude-dim">/</span> <span class="claude-green">Allow</span> access to <span class="claude-white">${folder}</span> ? <span class="claude-dim">(y/n)</span></div>`;
    html += `<div class="claude-line" style="animation-delay:700ms"><span class="claude-green">✓ Access granted</span></div>`;
    html += `<div class="claude-line" style="animation-delay:900ms"> </div>`;
    html += `<div class="claude-line" style="animation-delay:1000ms"><span class="claude-dim">tips: /help for commands, /compact to save context, /exit to quit</span></div>`;
    html += `</div>`;
    entry.appendChild(h('div', { class: 'out out-html', html }));
    logEl.appendChild(entry);
    entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function exitClaudeMode(logEl) {
    claudeState.active = false;
    const prefix = document.querySelector('.term-input .prompt-prefix');
    if (prefix) prefix.textContent = PROMPT;
    const field = document.querySelector('.term-field');
    if (field) field.placeholder = 'type `help` and hit enter';
    const hint = document.querySelector('.term-hint');
    if (hint) hint.textContent = 'type `help` for commands · `search <query>` or `tag <name>` to filter · ↑/↓ for history';
    const entry = h('div', { class: 'entry' });
    const dur = Math.round((Date.now() - claudeState.startTime) / 1000);
    let html = `<div class="claude-session">`;
    html += `<div class="claude-line"><span class="claude-dim">───────────────────────────────────────────</span></div>`;
    html += `<div class="claude-line"><span class="claude-blue">Claude:</span> Goodbye! Session ended.</div>`;
    html += `<div class="claude-line"><span class="claude-dim">messages: ${claudeState.msgs} · tokens: ${claudeState.tokens.toLocaleString()} · cost: $${claudeState.cost.toFixed(2)} · duration: ${dur}s</span></div>`;
    html += `</div>`;
    entry.appendChild(h('div', { class: 'out out-html', html }));
    logEl.appendChild(entry);
    entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function handleClaudeCommand(raw, logEl) {
    const entry = h('div', { class: 'entry' });
    entry.appendChild(h('div', { class: 'echo' },
      h('span', { class: 'prompt-prefix', text: CLAUDE_PROMPT, style: 'color:#c084fc;font-weight:600' }),
      h('span', { text: raw }),
    ));

    const cmd = raw.trim().toLowerCase();
    let html = '';

    if (cmd === '/exit' || cmd === '/logout' || cmd === '/quit') {
      logEl.appendChild(entry);
      exitClaudeMode(logEl);
      return;
    } else if (cmd === '/help') {
      html = `<div class="claude-session">
<div class="claude-line"><span class="claude-blue">Claude Code Commands</span></div>
<div class="claude-line"><span class="claude-dim">  /help</span>        show this help</div>
<div class="claude-line"><span class="claude-dim">  /compact</span>     compact conversation to save context</div>
<div class="claude-line"><span class="claude-dim">  /cost</span>        show session cost and token usage</div>
<div class="claude-line"><span class="claude-dim">  /status</span>      show connection status</div>
<div class="claude-line"><span class="claude-dim">  /model</span>       show current model info</div>
<div class="claude-line"><span class="claude-dim">  /clear</span>       clear the terminal</div>
<div class="claude-line"><span class="claude-dim">  /exit</span>        end claude session (or press Esc)</div>
<div class="claude-line"> </div>
<div class="claude-line"><span class="claude-dim">Any other text is sent as a message to Claude.</span></div>
</div>`;
    } else if (cmd === '/compact') {
      claudeState.tokens = Math.round(claudeState.tokens * 0.3);
      html = `<div class="claude-session">
<div class="claude-line"><span class="claude-green">✓ Compacted conversation</span></div>
<div class="claude-line"><span class="claude-dim">context reduced to ${claudeState.tokens.toLocaleString()} tokens (saved ~70%)</span></div>
</div>`;
    } else if (cmd === '/cost') {
      const dur = Math.round((Date.now() - claudeState.startTime) / 1000);
      html = `<div class="claude-session">
<div class="claude-line"><span class="claude-blue">Session Cost</span></div>
<div class="claude-line"><span class="claude-dim">  messages:</span>  ${claudeState.msgs}</div>
<div class="claude-line"><span class="claude-dim">  tokens:</span>    ${claudeState.tokens.toLocaleString()} (in + out)</div>
<div class="claude-line"><span class="claude-dim">  cost:</span>      $${claudeState.cost.toFixed(2)}</div>
<div class="claude-line"><span class="claude-dim">  duration:</span>  ${dur}s</div>
<div class="claude-line"><span class="claude-dim">  context:</span>   ${'█'.repeat(Math.round(claudeState.tokens / 60000))}${'░'.repeat(Math.max(0, 16 - Math.round(claudeState.tokens / 60000)))} ${Math.round(claudeState.tokens / 10000)}% of 1M</div>
</div>`;
    } else if (cmd === '/status') {
      html = `<div class="claude-session">
<div class="claude-line"><span class="claude-green">● Connected</span></div>
<div class="claude-line"><span class="claude-dim">  model:</span>     claude-opus-4-6</div>
<div class="claude-line"><span class="claude-dim">  context:</span>   1,000,000 tokens</div>
<div class="claude-line"><span class="claude-dim">  tools:</span>     Read, Edit, Write, Bash, Grep, Glob</div>
<div class="claude-line"><span class="claude-dim">  cwd:</span>       ${currentPath()}</div>
</div>`;
    } else if (cmd === '/model') {
      html = `<div class="claude-session">
<div class="claude-line"><span class="claude-blue">Model:</span> claude-opus-4-6 (1M context)</div>
<div class="claude-line"><span class="claude-dim">provider: Anthropic · max output: 32K tokens · vision: yes</span></div>
</div>`;
    } else if (cmd === '/clear') {
      logEl.appendChild(entry);
      clear(logEl);
      return;
    } else if (cmd.startsWith('/')) {
      html = `<div class="claude-session">
<div class="claude-line"><span class="claude-err">Unknown command: ${cmd}. Type /help for available commands.</span></div>
</div>`;
    } else if (COMMANDS[cmd.split(/\s+/)[0]]) {
      // It's a regular terminal command — run it and note it
      const parts = raw.trim().split(/\s+/);
      const cmdName = parts[0].toLowerCase();
      const cmdArgs = parts.slice(1);
      const termCmd = COMMANDS[cmdName];
      let result;
      try { result = termCmd.run(cmdArgs, { raw: raw.trim(), name: cmdName }); } catch {}
      if (result) {
        if (result.type === 'navigate') {
          html = `<div class="claude-session"><div class="claude-line"><span class="claude-dim">⚡ terminal:</span> running \`${cmd}\`</div></div>`;
          entry.appendChild(h('div', { class: 'out out-html', html }));
          logEl.appendChild(entry);
          navigate(result.hash);
          return;
        } else if (result.type === 'open') {
          window.open(result.url, '_blank', 'noopener,noreferrer');
          html = `<div class="claude-session"><div class="claude-line"><span class="claude-dim">⚡ terminal:</span> opening ${result.url}</div></div>`;
        } else if (result.type === 'html') {
          html = `<div class="claude-session"><div class="claude-line"><span class="claude-dim">⚡ terminal:</span> running \`${cmd}\`</div></div>`;
          entry.appendChild(h('div', { class: 'out out-html', html }));
          entry.appendChild(h('div', { class: 'out out-html', html: result.text }));
          logEl.appendChild(entry);
          entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return;
        } else if (result.type === 'clear') {
          clear(logEl);
          return;
        } else {
          const text = result.text;
          const lines = Array.isArray(text) ? text.join('\n') : String(text ?? '');
          html = `<div class="claude-session"><div class="claude-line"><span class="claude-dim">⚡ terminal:</span> running \`${cmd}\`</div></div>`;
          entry.appendChild(h('div', { class: 'out out-html', html }));
          entry.appendChild(h('pre', { class: result.type === 'err' ? 'out err' : 'out', text: lines }));
          logEl.appendChild(entry);
          entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return;
        }
      }
    } else {
      // Regular message — simulate Claude responding
      claudeState.msgs++;
      const willError = Math.random() < 0.15;
      if (willError) {
        const err = claudeErrors[Math.floor(Math.random() * claudeErrors.length)];
        html = `<div class="claude-session">
<div class="claude-line" style="animation-delay:0ms"><span class="claude-thinking">⏳ Thinking...</span></div>
<div class="claude-line" style="animation-delay:1800ms"><span class="claude-err">${err}</span></div>
</div>`;
      } else {
        const resp = claudeResponses[Math.floor(Math.random() * claudeResponses.length)];
        const inTok = 800 + Math.floor(Math.random() * 12000);
        const outTok = 200 + Math.floor(Math.random() * 2000);
        claudeState.tokens += inTok + outTok;
        claudeState.cost += (inTok * 0.000003 + outTok * 0.000015);
        const dur = (1.5 + Math.random() * 8).toFixed(1);
        html = `<div class="claude-session">
<div class="claude-line" style="animation-delay:0ms"><span class="claude-thinking">⏳ Thinking...</span></div>
<div class="claude-line" style="animation-delay:2000ms"><span class="claude-blue">Claude:</span> ${resp}</div>
<div class="claude-line" style="animation-delay:2400ms"> </div>
<div class="claude-line" style="animation-delay:2600ms"><span class="claude-dim">─ tokens: ${inTok.toLocaleString()} in · ${outTok.toLocaleString()} out · cost: $${(inTok * 0.000003 + outTok * 0.000015).toFixed(3)} · ${dur}s</span></div>
</div>`;
      }
    }

    if (html) entry.appendChild(h('div', { class: 'out out-html', html }));
    logEl.appendChild(entry);
    entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  addCmd('claude', 'start a claude code session', () => ({ type: 'claude-enter' }), { hidden: true });

  // --- hidden easter eggs ---
  addCmd('sudo', 'hidden', (args) => ({
    type: 'err',
    text: args.length
      ? 'harrison is not in the sudoers file. this incident will be reported.'
      : 'usage: sudo <command>. (it still will not work.)',
  }), { hidden: true });

  addCmd('rm', 'hidden', (args) => {
    const j = args.join(' ');
    if (/-rf?|\//.test(j)) {
      return { type: 'err', text: 'rm: operation not permitted. the taxi-yellow is load-bearing.' };
    }
    return { type: 'err', text: 'rm: missing operand' };
  }, { hidden: true });

  addCmd('vim', 'hidden', () => ({
    type: 'out',
    text: 'E325: ATTENTION. found a swap file. recovering uncommitted work from 2021...',
  }), { hidden: true });

  addCmd('emacs', 'hidden', () => ({
    type: 'out',
    text: 'emacs: loading 4.3 GB of lisp... please hold.',
  }), { hidden: true });

  addCmd('coffee', 'hidden', () => ({
    type: 'err',
    text: 'coffee: brew failed. manual intervention required (go to the kitchen).',
  }), { hidden: true });

  addCmd('matrix', 'hidden', () => ({
    type: 'out',
    text: 'wake up, visitor... the yellow has you. follow the cursor.',
  }), { hidden: true });

  addCmd('42', 'hidden', () => ({ type: 'out', text: 'yes.' }), { hidden: true });

  addCmd('ping', 'hidden', (args) => {
    const host = args[0] || 'localhost';
    return {
      type: 'out',
      text: `PING ${host}: 56 data bytes\n64 bytes from vibe: icmp_seq=0 ttl=∞ time=0.042 ms`,
    };
  }, { hidden: true });

  addCmd('man', 'hidden', (args) => ({
    type: 'out',
    text: args[0] ? `No manual entry for ${args[0]}. try \`help\`.` : 'What manual page do you want?',
  }), { hidden: true });

  addCmd('make', 'hidden', () => ({
    type: 'err',
    text: 'make: *** no rule to make target \'coffee\'. stop.',
  }), { hidden: true });

  addCmd(['cowsay'], 'hidden', (args) => {
    const msg = args.join(' ') || 'moo.';
    const top = ' ' + '_'.repeat(msg.length + 2);
    const bot = ' ' + '-'.repeat(msg.length + 2);
    return {
      type: 'out',
      text: [top, `< ${msg} >`, bot, '        \\   ^__^', '         \\  (oo)\\_______', '            (__)\\       )\\/\\', '                ||----w |', '                ||     ||'],
    };
  }, { hidden: true });

  function totalHiddenCount() {
    const seen = new Set();
    for (const c of Object.values(COMMANDS)) {
      if (c.hidden && !seen.has(c.name)) seen.add(c.name);
    }
    return seen.size;
  }

  function renderSecretsSection() {
    const wrap = h('section', { class: 'secrets', id: 'secrets-section', 'aria-label': 'discovered secrets' });
    const total = totalHiddenCount();
    const found = [...state.foundSecrets].filter((n) => COMMANDS[n]?.hidden).sort();

    wrap.appendChild(h('div', { class: 'secrets-head' },
      h('span', { class: 'label', text: '~/.secrets/' }),
      h('span', { class: 'count', text: `(${found.length}/${total} found)` }),
    ));

    const body = h('div', { class: 'secrets-body' });
    if (found.length === 0) {
      body.textContent = '// hint: unix classics work in the terminal. try `cowsay hi`.';
    } else {
      found.forEach((name) => {
        body.appendChild(h('span', { class: 'egg', text: name }));
      });
    }
    wrap.appendChild(body);
    return wrap;
  }

  function refreshSecretsSection() {
    const old = document.getElementById('secrets-section');
    if (!old) return;
    old.replaceWith(renderSecretsSection());
  }

  function executeCommand(raw, logEl) {
    // Claude mode intercept
    if (claudeState.active) {
      handleClaudeCommand(raw, logEl);
      return;
    }

    const parts = raw.split(/\s+/);
    const name = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const cmd = COMMANDS[name];

    if (cmd && cmd.hidden && !state.foundSecrets.has(cmd.name)) {
      state.foundSecrets.add(cmd.name);
      saveFoundSecrets();
      refreshSecretsSection();
    }

    const entry = h('div', { class: 'entry' });
    entry.appendChild(h('div', { class: 'echo' },
      h('span', { class: 'prompt-prefix', text: PROMPT }),
      h('span', { text: raw }),
    ));

    let result;
    if (!cmd) {
      result = { type: 'err', text: `command not found: ${name}. try \`help\`.` };
    } else {
      try { result = cmd.run(args, { raw, name }); }
      catch (err) { result = { type: 'err', text: String(err?.message || err) }; }
    }

    if (result) {
      if (result.type === 'clear') { clear(logEl); return; }
      if (result.type === 'claude-enter') {
        logEl.appendChild(entry);
        enterClaudeMode(logEl);
        return;
      }
      if (result.type === 'navigate') {
        logEl.appendChild(entry);
        navigate(result.hash);
        return;
      }
      if (result.type === 'open') {
        window.open(result.url, '_blank', 'noopener,noreferrer');
        entry.appendChild(h('pre', { class: 'out', text: `opening ${result.url}` }));
      } else if (result.type === 'html') {
        entry.appendChild(h('div', { class: 'out out-html', html: result.text }));
      } else {
        const text = result.text;
        const lines = Array.isArray(text) ? text.join('\n') : String(text ?? '');
        entry.appendChild(h('pre', { class: result.type === 'err' ? 'out err' : 'out', text: lines }));
      }
    }
    logEl.appendChild(entry);
    entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderTerminal({ placeholder } = {}) {
    const wrap = h('section', { class: 'term', 'aria-label': 'interactive terminal' });
    wrap.appendChild(h('span', { class: 'term-label', text: '~/terminal/  (type anywhere — keystrokes land here)' }));
    const log = h('div', { class: 'term-log' });
    wrap.appendChild(log);

    const form = h('form', { class: 'term-input is-empty' });
    form.appendChild(h('span', { class: 'prompt-prefix', text: PROMPT }));
    const field = h('input', {
      class: 'term-field',
      type: 'text',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: placeholder || 'type `help` and hit enter',
      'aria-label': 'terminal command input',
    });
    form.appendChild(field);
    form.appendChild(h('span', { class: 'term-ghost', text: '█' }));
    // clicking anywhere in the box focuses the input
    form.addEventListener('mousedown', (e) => {
      if (e.target !== field) {
        e.preventDefault();
        field.focus({ preventScroll: true });
      }
    });
    wrap.appendChild(form);
    wrap.appendChild(h('p', { class: 'term-hint', text: 'type `help` for commands · `search <query>` or `tag <name>` to filter · ↑/↓ for history' }));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = field.value.trim();
      if (!raw) return;
      field.value = '';
      form.classList.add('is-empty');
      cmdHistory.list.push(raw);
      cmdHistory.index = cmdHistory.list.length;
      executeCommand(raw, log);
    });
    field.addEventListener('input', () => {
      form.classList.toggle('is-empty', field.value.length === 0);
    });

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && claudeState.active) {
        e.preventDefault();
        exitClaudeMode(log);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!cmdHistory.list.length) return;
        cmdHistory.index = Math.max(0, cmdHistory.index - 1);
        field.value = cmdHistory.list[cmdHistory.index] || '';
        requestAnimationFrame(() => field.setSelectionRange(field.value.length, field.value.length));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!cmdHistory.list.length) return;
        cmdHistory.index = Math.min(cmdHistory.list.length, cmdHistory.index + 1);
        field.value = cmdHistory.list[cmdHistory.index] || '';
      }
    });

    // always autofocus on non-touch devices; touch devices would pop the keyboard
    const isTouchDevice = matchMedia('(hover: none), (pointer: coarse)').matches;
    if (!isTouchDevice) {
      termFocusPending = false;
      setTimeout(() => field.focus({ preventScroll: true }), 40);
    }

    return wrap;
  }

  // --- Router ------------------------------------------------------------------

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '').replace(/\/$/, '');
    if (!raw) return { view: 'home' };
    const parts = raw.split('/').filter(Boolean);
    if (parts.length === 1) {
      // could be category OR a project id (shortcut)
      const seg = parts[0];
      if (state.data.categories[seg]) return { view: 'folder', category: seg };
      if (state.data.projects[seg]) {
        const p = state.data.projects[seg];
        return { view: 'project', category: p.category, project: seg };
      }
      return { view: 'error', message: `No such entry: ${seg}` };
    }
    if (parts.length >= 2) {
      const [catId, projId] = parts;
      if (state.data.projects[projId]) {
        return { view: 'project', category: state.data.projects[projId].category, project: projId };
      }
      if (state.data.categories[catId]) {
        return { view: 'folder', category: catId, message: `No such file: ${projId}.md` };
      }
      return { view: 'error', message: `No such path: ${parts.join('/')}` };
    }
    return { view: 'home' };
  }

  function navigate(hash) {
    if (location.hash === hash || (hash === '#/' && (!location.hash || location.hash === '#'))) {
      // still re-render (e.g., clicking current crumb)
      handleRoute({ animate: true, fromClick: true });
      return;
    }
    location.hash = hash;
  }

  function handleRoute({ animate = true } = {}) {
    const route = parseHash();
    if (route.view === 'home') { renderHome(); return; }
    if (route.view === 'folder') { renderFolder(route.category, { animate }); return; }
    if (route.view === 'project') { renderProject(route.project, { animate }); return; }
    if (route.view === 'error') { renderError(route.message); return; }
  }

  window.addEventListener('hashchange', () => handleRoute({ animate: true }));

  // --- Boot --------------------------------------------------------------------

  async function loadData() {
    try {
      const res = await fetch('projects.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      // file:// browsers (some) block fetch of local JSON — show a clear error
      SCREEN.innerHTML = '';
      SCREEN.appendChild(headerBlockStatic());
      SCREEN.appendChild(h('div', { class: 'error-box' },
        h('strong', { text: 'Could not load projects.json — ' }),
        document.createTextNode(String(err.message || err)),
        h('br'),
        h('br'),
        document.createTextNode('If you opened index.html directly via file://, some browsers block local JSON fetches. '),
        document.createTextNode('Serve the folder over HTTP (e.g., '),
        h('code', { text: 'python -m http.server' }),
        document.createTextNode(') or push to GitHub Pages.'),
      ));
      throw err;
    }
  }

  function headerBlockStatic() {
    return h('pre', { class: 'brand', text: BRAND_ASCII });
  }

  async function main() {
    try {
      state.data = await loadData();
    } catch { return; }

    const hasHash = !!location.hash && location.hash !== '#' && location.hash !== '#/';
    if (hasHash) {
      state.bootDone = true;
      handleRoute({ animate: false });
    } else {
      await renderBoot();
    }
  }

  main();
})();
