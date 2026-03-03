/* RAGTS Design Guide — App Bar
   Injects the shared header, wires navigation + cross-page search.
   Include at the end of each guide page:
     <script src="_inc/appbar.js"></script>
*/
(function () {
  'use strict';

  /* ── Page registry ────────────────────────────────────── */
  var PAGES = [
    {
      file: 'layout.html',
      title: 'Design Tokens',
      sections: [
        'Color Tokens',
        'Typography Tokens',
        'Spacing Tokens',
        'Layout Tokens',
        'Shape Tokens',
        'Animation Tokens',
        'CSS Custom Properties Map',
        'CSS Classes',
      ],
    },
    {
      file: 'components.html',
      title: 'Component Library',
      sections: [
        '1. Card (Base)',
        '2. Button',
        '3. Input',
        '4. Badge',
        '5. Session Card',
        '6. Toast / Notification',
        '7. AppHeader',
        '8. Search Bar',
        '9. Upload Zone',
        '10. Section Header',
        '11. Modal Shell',
        '12. Empty State',
        '13. Skeleton Loader',
        '14. Dropdown / Select',
        '15. Date Input',
        '16. Email Input',
        '17. Terminal Chrome',
        '18. Breadcrumb',
        '19. Previous / Next Navigation',
        '20. Filter Pills',
        '21. Spinners & Loaders',
        '22. Session Viewer (Composition)',
      ],
    },
    {
      file: 'iconography.html',
      title: 'Iconography',
      sections: [
        'Size Classes Reference',
        'Color Inheritance',
        'Typography Baseline Match',
      ],
    },
  ];

  var SEARCHABLE_SELECTOR = 'p, h1, h2, h3, h4, li, td, th, .card__title, .card__label, .card__value, .card__desc, .section__description, .page__subtitle';

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  /* ── Header markup (mirrors appbar.html) ──────────────── */
  var HEADER_HTML = [
    '<header class="app-header" style="position:fixed;top:0;left:0;right:0;z-index:100">',
    '  <div class="app-header__left">',
    '    <a class="app-header__brand" href="index.html">',
    '      <div class="app-header__logo">R</div>',
    '      <span class="app-header__name">RAGTS</span>',
    '    </a>',
    '    <nav class="app-header__nav">',
    '      <div class="dropdown" id="guide-dropdown">',
    '        <button class="dropdown__trigger" type="button">',
    '          <span id="guide-dropdown-label">Design Guide</span>',
    '          <span class="dropdown__chevron"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6l4 4 4-4"/></svg></span>',
    '        </button>',
    '        <div class="dropdown__menu" id="guide-menu"></div>',
    '      </div>',
    '    </nav>',
    '    <div class="search-bar app-header__search" style="position:relative">',
    '      <span class="search-bar__icon"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4 4"/></svg></span>',
    '      <input class="search-bar__input" id="guide-search" type="text" placeholder="Search all pages\u2026">',
    '      <span id="guide-search-count"></span>',
    '      <div id="guide-search-results" class="search-results"></div>',
    '    </div>',
    '  </div>',
    '  <div class="app-header__right">',
    '    <div class="nav-arrows">',
    '      <button class="nav-arrow" id="nav-prev" title="Previous page"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3L5 8l5 5"/></svg></button>',
    '      <button class="nav-arrow" id="nav-next" title="Next page"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3l5 5-5 5"/></svg></button>',
    '    </div>',
    '    <div class="app-header__avatar">SM</div>',
    '  </div>',
    '</header>',
  ].join('\n');

  /* ── Injected styles ──────────────────────────────────── */
  var STYLE = document.createElement('style');
  STYLE.textContent = [
    /* Search highlights */
    'mark.search-hit { background: var(--accent-primary); color: var(--bg-base); border-radius: 2px; padding: 0 2px; }',
    '.search-hidden { display: none !important; }',
    '#guide-search-count { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); margin-left: var(--space-2); white-space: nowrap; }',

    /* Section anchor links (left-side) */
    '.section__title { position: relative; }',
    '.section__anchor { position: absolute; right: 100%; padding-right: var(--space-2); color: var(--text-disabled); text-decoration: none; opacity: 0; transition: opacity var(--duration-fast) var(--easing-default); font-weight: var(--weight-normal); }',
    '.section__title:hover .section__anchor, .section__anchor:focus { opacity: 1; color: var(--accent-primary); }',

    /* Cross-page results panel */
    '.search-results { display: none; position: absolute; top: 100%; right: var(--space-3); left: var(--space-3); margin-top: var(--space-1); background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); max-height: 400px; overflow-y: auto; z-index: 200; }',
    '@media (min-width: 768px) { .search-results { left: 0; right: auto; min-width: 320px; } }',
    '.search-results--open { display: block; }',
    '.search-results__group { padding: var(--space-2) var(--space-4) var(--space-1); font-family: var(--font-mono); font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-wider); }',
    '.search-results__group:not(:first-child) { margin-top: var(--space-1); border-top: 1px solid color-mix(in srgb, var(--border-default) 50%, transparent); padding-top: var(--space-3); }',
    '.search-results__item { display: block; padding: var(--space-2) var(--space-4); text-decoration: none; color: var(--text-secondary); font-size: var(--text-sm); cursor: pointer; transition: all var(--duration-fast) var(--easing-default); }',
    '.search-results__item:hover { background: color-mix(in srgb, var(--accent-primary) 8%, transparent); color: var(--text-primary); }',
    '.search-results__section { color: var(--text-muted); font-family: var(--font-mono); font-size: var(--text-xs); }',
    '.search-results__snippet { margin-top: 2px; }',
    '.search-results__snippet mark { background: var(--accent-primary); color: var(--bg-base); border-radius: 2px; padding: 0 1px; }',
    '.search-results__current { padding: var(--space-2) var(--space-4); font-size: var(--text-xs); color: var(--text-muted); font-style: italic; }',
  ].join('\n');
  document.head.appendChild(STYLE);

  /* ── Inject header ────────────────────────────────────── */
  var wrapper = document.createElement('div');
  wrapper.innerHTML = HEADER_HTML;
  var header = wrapper.firstElementChild;
  document.body.insertBefore(header, document.body.firstChild);

  var appEl = document.getElementById('app');
  if (appEl) appEl.style.paddingTop = 'var(--header-height)';

  /* ── Auto-assign IDs + anchor links to section headings ── */
  var sectionHeadings = document.querySelectorAll('.section__title');
  sectionHeadings.forEach(function (h) {
    if (!h.id) h.id = slugify(h.textContent);
    var anchor = document.createElement('a');
    anchor.className = 'section__anchor';
    anchor.href = '#' + h.id;
    anchor.textContent = '#';
    anchor.title = 'Copy link to section';
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      var url = location.origin + location.pathname + '#' + h.id;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url);
      }
      history.replaceState(null, '', '#' + h.id);
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    h.insertBefore(anchor, h.firstChild);
  });

  /* ── Dropdown toggle ──────────────────────────────────── */
  var dropdown = document.getElementById('guide-dropdown');
  var trigger = dropdown && dropdown.querySelector('.dropdown__trigger');
  if (trigger) {
    trigger.addEventListener('click', function () {
      dropdown.classList.toggle('dropdown--open');
    });
    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target)) dropdown.classList.remove('dropdown--open');
    });
  }

  /* ── Populate dropdown as cross-page TOC ──────────────── */
  var currentFile = location.pathname.split('/').pop() || 'index.html';
  var menu = document.getElementById('guide-menu');
  if (menu) {
    var html = '';
    PAGES.forEach(function (page) {
      var isCurrent = page.file === currentFile;
      html += '<div class="dropdown__group-label">' + page.title + '</div>';
      page.sections.forEach(function (sec) {
        var id = slugify(sec);
        var secHref = isCurrent ? '#' + id : page.file + '#' + id;
        html += '<a class="dropdown__option" href="' + secHref + '">' + sec + '</a>';
      });
    });
    menu.innerHTML = html;
    menu.addEventListener('click', function () {
      dropdown.classList.remove('dropdown--open');
    });
  }

  /* ── Scroll spy — update dropdown label + active item ─── */
  var labelEl = document.getElementById('guide-dropdown-label');
  var currentPageTitle = '';
  PAGES.forEach(function (p) {
    if (p.file === currentFile) currentPageTitle = p.title;
  });
  if (labelEl) labelEl.textContent = currentPageTitle;

  if (sectionHeadings.length > 0 && labelEl) {
    var activeOptionEl = null;

    var observer = new IntersectionObserver(function (entries) {
      /* Find the topmost visible heading */
      var visible = [];
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.push(entry);
      });
      if (visible.length === 0) return;

      /* Pick the one closest to the top */
      visible.sort(function (a, b) {
        return a.boundingClientRect.top - b.boundingClientRect.top;
      });

      var heading = visible[0].target;
      var title = heading.textContent.replace(/^#\s*/, '').trim();
      labelEl.textContent = title;

      /* Highlight active item in dropdown */
      if (activeOptionEl) activeOptionEl.classList.remove('dropdown__option--selected');
      var id = heading.id;
      if (menu) {
        activeOptionEl = menu.querySelector('a[href="#' + id + '"]');
        if (activeOptionEl) activeOptionEl.classList.add('dropdown__option--selected');
      }
    }, {
      rootMargin: '-' + (header.offsetHeight || 56) + 'px 0px -60% 0px',
      threshold: 0,
    });

    sectionHeadings.forEach(function (h) { observer.observe(h); });

    /* Reset label to page title when scrolled to very top */
    var topSentinel = document.createElement('div');
    topSentinel.style.height = '1px';
    var firstContent = document.querySelector('.page__title') || document.querySelector('#app');
    if (firstContent) {
      firstContent.parentNode.insertBefore(topSentinel, firstContent);
      var topObserver = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          labelEl.textContent = currentPageTitle;
          if (activeOptionEl) {
            activeOptionEl.classList.remove('dropdown__option--selected');
            activeOptionEl = null;
          }
        }
      }, { threshold: 0 });
      topObserver.observe(topSentinel);
    }
  }

  /* ── Prev / Next arrows ───────────────────────────────── */
  var pageIdx = -1;
  PAGES.forEach(function (p, i) { if (p.file === currentFile) pageIdx = i; });

  var prevBtn = document.getElementById('nav-prev');
  var nextBtn = document.getElementById('nav-next');

  if (prevBtn) {
    if (pageIdx > 0) {
      prevBtn.title = PAGES[pageIdx - 1].title;
      prevBtn.addEventListener('click', function () { location.href = PAGES[pageIdx - 1].file; });
    } else {
      prevBtn.disabled = true;
      prevBtn.style.opacity = '0.3';
      prevBtn.style.cursor = 'default';
    }
  }
  if (nextBtn) {
    if (pageIdx >= 0 && pageIdx < PAGES.length - 1) {
      nextBtn.title = PAGES[pageIdx + 1].title;
      nextBtn.addEventListener('click', function () { location.href = PAGES[pageIdx + 1].file; });
    } else {
      nextBtn.disabled = true;
      nextBtn.style.opacity = '0.3';
      nextBtn.style.cursor = 'default';
    }
  }

  /* ── Cross-page search index (from search-index.js) ──── */
  var searchIndex = window.GUIDE_SEARCH_INDEX || [];

  function searchIndexForPage(pageEntry, query) {
    var results = [];
    pageEntry.sections.forEach(function (sec) {
      var lower = sec.text.toLowerCase();
      var idx = lower.indexOf(query);
      if (idx === -1) return;

      /* Build a snippet with context around the match */
      var start = Math.max(0, idx - 40);
      var end = Math.min(sec.text.length, idx + query.length + 40);
      var snippet = (start > 0 ? '\u2026' : '') +
        escapeHtml(sec.text.slice(start, idx)) +
        '<mark>' + escapeHtml(sec.text.slice(idx, idx + query.length)) + '</mark>' +
        escapeHtml(sec.text.slice(idx + query.length, end)) +
        (end < sec.text.length ? '\u2026' : '');

      results.push({ section: sec.section, sectionId: sec.sectionId, snippet: snippet });
    });
    return results;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Search ───────────────────────────────────────────── */
  var searchInput = document.getElementById('guide-search');
  var counter = document.getElementById('guide-search-count');
  var resultsPanel = document.getElementById('guide-search-results');
  if (!searchInput) return;

  var debounceTimer;

  searchInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 200);
  });

  searchInput.addEventListener('focus', function () {
    if (resultsPanel.innerHTML) resultsPanel.classList.add('search-results--open');
  });

  /* Close results on outside click */
  document.addEventListener('click', function (e) {
    if (!header.contains(e.target)) {
      resultsPanel.classList.remove('search-results--open');
    }
  });

  /* Cmd/Ctrl+K focuses search */
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.value = '';
      runSearch();
      searchInput.blur();
    }
  });

  function runSearch(skipScroll) {
    var query = searchInput.value.trim().toLowerCase();

    /* Clear previous highlights on current page */
    document.querySelectorAll('mark.search-hit').forEach(function (m) {
      var parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });

    /* Restore hidden sections */
    document.querySelectorAll('.section, .subsection, section').forEach(function (s) {
      s.classList.remove('search-hidden');
    });

    /* Clear results panel */
    resultsPanel.innerHTML = '';
    resultsPanel.classList.remove('search-results--open');

    if (!query) {
      counter.textContent = '';
      return;
    }

    /* 1. Search current page (inline highlights) */
    var localHits = 0;
    var matchedSections = new Set();
    document.querySelectorAll(SEARCHABLE_SELECTOR).forEach(function (el) {
      if (header.contains(el)) return;
      if (el.textContent.toLowerCase().indexOf(query) === -1) return;
      highlightTextNodes(el, query);
      localHits++;
      var sec = el.closest('.section, .subsection, section');
      if (sec) matchedSections.add(sec);
    });

    document.querySelectorAll('.section, .subsection, section').forEach(function (s) {
      if (header.contains(s)) return;
      if (!matchedSections.has(s)) s.classList.add('search-hidden');
    });

    /* 2. Search other pages via static index */
    var totalOther = 0;
    var panelHtml = '';

    if (localHits > 0) {
      panelHtml += '<div class="search-results__current">' + localHits + ' match' + (localHits === 1 ? '' : 'es') + ' on this page (highlighted below)</div>';
    }

    searchIndex.forEach(function (entry) {
      if (entry.file === currentFile) return;
      var results = searchIndexForPage(entry, query);
      if (results.length === 0) return;
      totalOther += results.length;
      panelHtml += '<div class="search-results__group">' + entry.title + '</div>';
      results.forEach(function (r) {
        var href = entry.file + '?q=' + encodeURIComponent(query) + (r.sectionId ? '#' + r.sectionId : '');
        panelHtml += '<a class="search-results__item" href="' + href + '">';
        if (r.section) panelHtml += '<div class="search-results__section">' + r.section + '</div>';
        panelHtml += '<div class="search-results__snippet">' + r.snippet + '</div>';
        panelHtml += '</a>';
      });
    });

    var total = localHits + totalOther;
    counter.textContent = total ? total + ' match' + (total === 1 ? '' : 'es') : 'no matches';

    if (panelHtml) {
      resultsPanel.innerHTML = panelHtml;
      resultsPanel.classList.add('search-results--open');
    }

    /* Scroll to first local hit (unless caller handles scroll) */
    if (!skipScroll && localHits > 0) {
      var first = document.querySelector('mark.search-hit');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function highlightTextNodes(el, query) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      var text = node.textContent;
      var lower = text.toLowerCase();
      var idx = lower.indexOf(query);
      if (idx === -1) return;

      var frag = document.createDocumentFragment();
      var lastIdx = 0;

      while (idx !== -1) {
        if (idx > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
        var mark = document.createElement('mark');
        mark.className = 'search-hit';
        mark.textContent = text.slice(idx, idx + query.length);
        frag.appendChild(mark);
        lastIdx = idx + query.length;
        idx = lower.indexOf(query, lastIdx);
      }

      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* ── Handle ?q= parameter (cross-page search handoff) ── */
  var params = new URLSearchParams(location.search);
  var incomingQuery = params.get('q');
  if (incomingQuery) {
    searchInput.value = incomingQuery;
    var hashTarget = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    /* Small delay to let Vue pages finish rendering */
    setTimeout(function () {
      runSearch(true); /* skipScroll = true */
      /* Scroll to the hash target, not the first match */
      if (hashTarget) {
        hashTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    /* Clean up URL without reload */
    if (history.replaceState) {
      history.replaceState(null, '', location.pathname + location.hash);
    }
  }
})();
