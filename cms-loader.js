/**
 * Shamrock Ridge HOA — CMS Data Loader
 * Fetches JSON data files written by Decap CMS and renders them into the page.
 * Falls back gracefully if a file is missing or the site is opened without a server.
 */

const CMS = {

  // ── Helpers ──────────────────────────────────────────────────────────────

  async fetchJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // Parse YAML frontmatter from a markdown string
  parseFrontmatter(text) {
    if (!text || !text.startsWith('---')) return null;
    const end = text.indexOf('---', 3);
    if (end === -1) return null;
    const yaml = text.slice(3, end).trim();
    const obj = {};
    yaml.split('\n').forEach(line => {
      const colon = line.indexOf(':');
      if (colon === -1) return;
      const key = line.slice(0, colon).trim();
      let val = line.slice(colon + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Booleans and numbers
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (val !== '' && !isNaN(Number(val))) val = Number(val);
      obj[key] = val;
    });
    // Body content after second ---
    const body = text.slice(end + 3).trim();
    if (body) obj.body = body;
    return obj;
  },

  // Fetch a file — handles both .json and .md frontmatter
  async fetchFile(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      if (path.endsWith('.md')) {
        const text = await res.text();
        return this.parseFrontmatter(text);
      }
      return await res.json();
    } catch {
      return null;
    }
  },

  // Fetch all files in a _data/<folder>/ directory via an index file
  async fetchCollection(folder) {
    const index = await this.fetchJSON(`./_data/${folder}/index.json`);
    if (!index || !Array.isArray(index)) return [];
    const items = await Promise.all(index.map(f => this.fetchFile(`./_data/${folder}/${f}`)));
    return items.filter(Boolean);
  },

  formatDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  },

  categoryLabel(cat) {
    const map = {
      announcement: 'Announcement',
      event:        'Community Event',
      urgent:       'Important Notice',
      meeting:      'Meeting',
      financial:    'Financial',
    };
    return map[cat] || 'Announcement';
  },

  // ── Homepage ─────────────────────────────────────────────────────────────

  async loadHomepage() {
    // Hero text
    const hp = await this.fetchJSON('./_data/homepage.json');
    if (hp) {
      const title = document.querySelector('.hero-title');
      const sub   = document.querySelector('.hero-sub');
      if (title && hp.hero_title) title.textContent = hp.hero_title;
      if (sub   && hp.hero_sub)   sub.textContent   = hp.hero_sub;

      // Callouts
      const calloutTitles = document.querySelectorAll('.callout-title');
      const calloutTexts  = document.querySelectorAll('.callout-text');
      const keys = [
        ['callout1_title', 'callout1_text'],
        ['callout2_title', 'callout2_text'],
        ['callout3_title', 'callout3_text'],
      ];
      keys.forEach(([tk, vk], i) => {
        if (calloutTitles[i] && hp[tk]) calloutTitles[i].textContent = hp[tk];
        if (calloutTexts[i]  && hp[vk]) calloutTexts[i].textContent  = hp[vk];
      });
    }

    // Announcements — show up to 3 featured items
    await this.loadAnnouncementsGrid('.news-grid', 3, true);
  },

  // ── Announcements Grid (homepage + news page) ─────────────────────────

  async loadAnnouncementsGrid(selector, limit, featuredOnly) {
    const container = document.querySelector(selector);
    if (!container) return;

    const index = await this.fetchJSON('./_data/announcements/index.json');
    if (!index) return; // fall back to static HTML

    const all = await Promise.all(index.map(f => this.fetchFile(`./_data/announcements/${f}`)));
    let items = all.filter(Boolean);

    // Sort newest first
    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (featuredOnly) items = items.filter(x => x.featured !== false);
    if (limit) items = items.slice(0, limit);

    if (!items.length) return; // keep static HTML

    container.innerHTML = items.map(item => `
      <article class="news-card">
        <div class="news-card-body">
          <span class="news-tag ${item.category === 'urgent' ? 'urgent' : item.category === 'event' ? 'event' : ''}">${this.categoryLabel(item.category)}</span>
          <time class="news-date" datetime="${item.date}">${this.formatDate(item.date)}</time>
          <h3 class="news-title">${item.title}</h3>
          <p class="news-excerpt">${item.excerpt}</p>
          <a href="./news.html" class="news-read-more">
            Read more
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        </div>
      </article>
    `).join('');
  },

  // ── Full News Page ────────────────────────────────────────────────────────

  async loadNewsPage() {
    // Announcements list
    const listContainer = document.querySelector('.news-full-list');
    if (listContainer) {
      const index = await this.fetchJSON('./_data/announcements/index.json');
      if (index) {
        const all = await Promise.all(index.map(f => this.fetchFile(`./_data/announcements/${f}`)));
        let items = all.filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (items.length) {
          // Preserve the heading, replace only the article list below it
          const heading = listContainer.querySelector('h2');
          listContainer.innerHTML = (heading ? heading.outerHTML : '<h2 class="section-title" style="margin-bottom:var(--space-8)">Announcements</h2>') + items.map(item => `
            <article class="news-full-item">
              <div class="news-full-meta">
                <span class="news-tag ${item.category === 'urgent' ? 'urgent' : item.category === 'event' ? 'event' : ''}">${this.categoryLabel(item.category)}</span>
                <time class="news-date" datetime="${item.date}">${this.formatDate(item.date)}</time>
              </div>
              <h2 class="news-full-title">${item.title}</h2>
              <div class="news-full-body">
                ${item.body ? item.body : `<p>${item.excerpt}</p>`}
              </div>
            </article>
          `).join('<hr class="news-divider">');
        }
      }
    }

    // Events sidebar
    const eventsContainer = document.querySelector('.events-list');
    if (eventsContainer) {
      const index = await this.fetchJSON('./_data/events/index.json');
      if (index) {
        const all = await Promise.all(index.map(f => this.fetchFile(`./_data/events/${f}`)));
        let events = all.filter(Boolean)
          .filter(e => new Date(e.event_date + 'T12:00:00') >= new Date())
          .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
        if (events.length) {
          const evHeading = eventsContainer.querySelector('h2');
          const evHeadingHTML = evHeading ? evHeading.outerHTML : '<h2 class="section-title" style="margin-bottom:var(--space-6)">Upcoming Events</h2>';
          eventsContainer.innerHTML = evHeadingHTML + events.map(ev => {
            const d = new Date(ev.event_date + 'T12:00:00');
            const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
            const day   = d.getDate();
            return `
              <div class="event-item">
                <div class="event-date-block">
                  <span class="event-month">${month}</span>
                  <span class="event-day">${day}</span>
                </div>
                <div class="event-details">
                  <p class="event-title">${ev.title}</p>
                  ${ev.event_time ? `<p class="event-meta">${ev.event_time}${ev.location ? ' · ' + ev.location : ''}</p>` : ''}
                  ${ev.description ? `<p class="event-desc">${ev.description}</p>` : ''}
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }
  },

  // ── Vendors Page ─────────────────────────────────────────────────────────

  async loadVendorsPage() {
    const grid = document.getElementById('vendors-grid');
    if (!grid) return;

    // ── Load categories + vendors in parallel ────────────────────────────
    const [vendors, rawCats] = await Promise.all([
      this.fetchCollection('vendors'),
      this.fetchJSON('./_data/vendor-categories.json'),
    ]);

    if (!vendors.length) return; // keep static fallback HTML

    // Build category lookup maps from the JSON file
    // Data is wrapped as { categories: [...] } so Decap CMS can edit it
    const categories = Array.isArray(rawCats) ? rawCats
      : (rawCats && Array.isArray(rawCats.categories)) ? rawCats.categories
      : [];

    // icon paths keyed by icon name (built-in library — no external deps)
    const iconPaths = {
      hvac:        '<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/>',
      plumbing:    '<path d="M12 2a5 5 0 0 1 5 5v3H7V7a5 5 0 0 1 5-5z"/><rect x="7" y="10" width="10" height="12" rx="1"/><line x1="12" y1="10" x2="12" y2="22"/>',
      electrical:  '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      pest:        '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      lawn:        '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      roofing:     '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
      contractor:  '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
      pool:        '<path d="M2 12h20M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
      painting:    '<path d="M19 11H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z"/><path d="M14 11V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
      cleaning:    '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/>',
      other:       '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    };

    // Color palette cycles for unknown categories
    const colorPalette = [
      'var(--color-primary)',
      'var(--color-blue, #4a90a4)',
      'var(--color-warning)',
      'var(--color-success)',
      'var(--color-accent)',
      'var(--color-error)',
    ];

    // Build slug → { label, icon path, color } map (always lowercase slugs)
    const catMap = {};
    categories.forEach((c, i) => {
      const slug = (c.slug || '').toLowerCase();
      catMap[slug] = {
        label: c.label || c.slug,
        icon:  iconPaths[c.icon] || iconPaths.other,
        color: colorPalette[i % colorPalette.length],
      };
    });

    // ── Populate filter tabs ──────────────────────────────────────────────
    const tabsEl = document.getElementById('vendor-filter-tabs');
    if (tabsEl && categories.length) {
      // Only show tabs for categories that have at least one active vendor
      const activeVendorCats = new Set(
        vendors.filter(v => v.active !== false).map(v => (v.category || 'other').toLowerCase())
      );
      const tabsHTML = categories
        .filter(c => activeVendorCats.has((c.slug || '').toLowerCase()))
        .map(c => `<button class="filter-tab" data-filter="${this.escHtml((c.slug||'').toLowerCase())}">${this.escHtml(c.label)}</button>`)
        .join('');
      // Insert after the "All" button
      tabsEl.querySelector('[data-filter="all"]').insertAdjacentHTML('afterend', tabsHTML);
    }

    // ── Populate suggest-form category dropdown ───────────────────────────
    const catSelect = document.getElementById('v-category');
    if (catSelect && categories.length) {
      catSelect.innerHTML = `<option value="">Select a category…</option>` +
        categories.map(c => `<option value="${this.escHtml(c.slug)}">${this.escHtml(c.label)}</option>`).join('');
    }

    // ── Render vendor cards ───────────────────────────────────────────────
    // Filter to active only, sort alphabetically
    const active = vendors
      .filter(v => v.active !== false)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (!active.length) return;

    const phoneSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.62 4.9 2 2 0 0 1 3.6 2.74h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 18z"/></svg>`;
    const webSVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

    // Preserve the no-results element
    const noResults = grid.querySelector('#no-results');

    grid.innerHTML = active.map(v => {
      const slug  = (v.category || 'other').toLowerCase();
      const meta  = catMap[slug] || { label: v.category || 'Other', icon: iconPaths.other, color: 'var(--color-primary)' };
      const nameSearch = (v.name + ' ' + meta.label + ' ' + (v.description || '') + ' forney').toLowerCase();

      // Format phone for display: digits only → (XXX) XXX-XXXX
      let phoneDisplay = v.phone || '';
      let phoneDigits  = (v.phone || '').replace(/\D/g, '');
      if (phoneDigits.length === 10) {
        phoneDisplay = `(${phoneDigits.slice(0,3)}) ${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`;
      }

      return `
        <div class="vendor-card" data-category="${this.escHtml(slug)}" data-name="${this.escHtml(nameSearch)}">
          <div class="vendor-card-top">
            <div class="vendor-icon" style="background:color-mix(in oklab,${meta.color} 12%,transparent);color:${meta.color}">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${meta.icon}</svg>
            </div>
            ${v.recommended ? '<span class="vendor-badge">Community Recommended</span>' : ''}
          </div>
          <p class="vendor-category-label">${this.escHtml(meta.label)}</p>
          <p class="vendor-name">${this.escHtml(v.name || '')}</p>
          ${v.description ? `<p class="vendor-desc">${this.escHtml(v.description)}</p>` : ''}
          <div class="vendor-actions">
            ${phoneDigits ? `<a href="tel:${phoneDigits}" class="vendor-btn vendor-btn-phone">${phoneSVG} ${this.escHtml(phoneDisplay)}</a>` : ''}
            ${v.website ? `<a href="${this.escHtml(v.website)}" target="_blank" rel="noopener noreferrer" class="vendor-btn vendor-btn-web">${webSVG} Website</a>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Re-add no-results div
    if (noResults) grid.appendChild(noResults);

    // Re-init filter/search since new cards were injected
    if (typeof initVendorControls === 'function') initVendorControls();
  },

  escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // ── Contact / Board Page ──────────────────────────────────────────────────

  async loadContactPage() {
    // Board members
    const boardGrid = document.querySelector('.board-grid');
    if (boardGrid) {
      const index = await this.fetchJSON('./_data/board/index.json');
      if (index) {
        const all = await Promise.all(index.map(f => this.fetchFile(`./_data/board/${f}`)));
        let members = all.filter(Boolean).sort((a, b) => (a.order || 99) - (b.order || 99));
        const colors = [
          'var(--color-primary)',
          'var(--color-accent)',
          'var(--color-success)',
          'var(--color-blue, #4a90a4)',
          'var(--color-warning)',
        ];
        const initials = {
          'President':       'P',
          'Vice President':  'VP',
          'Treasurer':       'T',
          'Secretary':       'S',
          'Director at Large': 'D',
        };
        if (members.length) {
          boardGrid.innerHTML = members.map((m, i) => `
            <div class="board-card">
              <div class="board-avatar" style="background:${colors[i % colors.length]};color:#fff;font-family:var(--font-display)">${initials[m.role] || m.name.charAt(0)}</div>
              <p class="board-name">${m.name}</p>
              <p class="board-role">${m.role}</p>
              ${m.term ? `<p style="font-size:var(--text-xs);color:var(--color-text-muted)">Term expires: ${m.term}</p>` : ''}
              ${m.email ? `<a href="mailto:${m.email}" style="font-size:var(--text-xs);color:var(--color-primary)">${m.email}</a>` : ''}
            </div>
          `).join('');
        }
      }
    }

    // Management company
    const mgmt = await this.fetchJSON('./_data/management.json');
    if (mgmt) {
      const setEl = (sel, val, attr) => {
        const el = document.querySelector(sel);
        if (el && val) { attr ? el.setAttribute(attr, val) : (el.textContent = val); }
      };
      setEl('[data-cms="company-name"]',    mgmt.company_name);
      setEl('[data-cms="phone"]',           mgmt.phone);
      setEl('[data-cms="email"]',           mgmt.email);
      setEl('[data-cms="email-link"]',      mgmt.email, 'href');
      setEl('[data-cms="address"]',         mgmt.address);
      setEl('[data-cms="office-hours"]',    mgmt.office_hours);
      setEl('[data-cms="emergency-phone"]', mgmt.emergency_phone);
      // Payment portal link
      if (mgmt.payment_url) {
        const payLink = document.querySelector('[data-cms="payment-link"]');
        if (payLink) { payLink.href = mgmt.payment_url; payLink.style.display = ''; }
      }
    }
  },

  // ── Real Estate / Pinned Listings ─────────────────────────────────────────

  async loadRealEstatePage() {
    const grid = document.getElementById('pinned-listings-grid');
    if (!grid) return;

    const listings = await this.fetchCollection('listings');

    // Filter to active only
    const active = (listings || []).filter(l => l.active !== false);

    if (!active.length) {
      // Show empty state
      grid.innerHTML = `
        <div class="pinned-empty">
          <p>No listings currently pinned by the board.</p>
          <p>Check Zillow, Redfin, or Realtor.com using the links above to see all homes for sale.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = active.map(l => {
      const photo = l.photo
        ? `<div class="pinned-photo" style="background-image:url('${this.escHtml(l.photo)}')"></div>`
        : `<div class="pinned-photo pinned-photo-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`;

      return `
        <a class="pinned-card" href="${this.escHtml(l.url || '#')}" target="_blank" rel="noopener noreferrer">
          ${photo}
          <div class="pinned-card-body">
            <p class="pinned-price">${this.escHtml(l.price || '')}</p>
            <p class="pinned-address">${this.escHtml(l.address || '')}</p>
            <div class="pinned-stats">
              ${l.beds  ? `<span>${this.escHtml(String(l.beds))} bd</span>` : ''}
              ${l.baths ? `<span>${this.escHtml(String(l.baths))} ba</span>` : ''}
              ${l.sqft  ? `<span>${this.escHtml(l.sqft)} sqft</span>` : ''}
              ${l.dom   ? `<span>${this.escHtml(l.dom)}</span>` : ''}
            </div>
            ${l.description ? `<p class="pinned-desc">${this.escHtml(l.description)}</p>` : ''}
            <span class="pinned-cta">View Listing &rarr;</span>
          </div>
        </a>
      `;
    }).join('');
  },

};

// Auto-detect which page we're on and load appropriate data
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.endsWith('index.html') || path.endsWith('/') || path === '') {
    CMS.loadHomepage();
  } else if (path.includes('news')) {
    CMS.loadNewsPage();
  } else if (path.includes('contact')) {
    CMS.loadContactPage();
  } else if (path.includes('vendors')) {
    CMS.loadVendorsPage();
  } else if (path.includes('realestate')) {
    CMS.loadRealEstatePage();
  }
});
