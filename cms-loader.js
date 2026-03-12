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
  }
});
