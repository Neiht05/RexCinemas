/* ============================================
   REX CINEMAS - MAIN PAGE (Homepage)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    const movieGrid = document.getElementById('movie-grid');
    const comingSoonGrid = document.getElementById('coming-soon-grid');

    let allNowShowingMovies = [];
    let allComingSoonMovies = [];
    let heroMovies = [];
    let currentHeroIndex = 0;
    let heroTimer = null;
    let revealObserver = null;

    function initScrollReveal() {
        const targets = [
            ...document.querySelectorAll(
                '.vue-see-whats-on, .genre-filter-wrapper, .vue-section, .promo-banner, .vue-film-card, .vue-split-banner, .vue-article, .media-thumb-btn'
            )
        ];

        if (!('IntersectionObserver' in window)) {
            targets.forEach((el) => el.classList.add('is-visible'));
            return;
        }

        if (!revealObserver) {
            revealObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        revealObserver.unobserve(entry.target);
                    }
                });
            }, {
                threshold: 0.14,
                rootMargin: '0px 0px -8% 0px'
            });
        }

        targets.forEach((el, index) => {
            if (el.classList.contains('is-visible')) return;
            el.classList.add('scroll-reveal');
            el.style.setProperty('--reveal-delay', `${Math.min(index % 6, 5) * 70}ms`);
            revealObserver.observe(el);
        });
    }

    // ============ HERO SLIDER ============
    window.changeHeroSlide = (direction) => {
        if (heroMovies.length === 0) return;
        currentHeroIndex += direction;
        if (currentHeroIndex < 0) currentHeroIndex = heroMovies.length - 1;
        if (currentHeroIndex >= heroMovies.length) currentHeroIndex = 0;
        updateHero(heroMovies[currentHeroIndex]);
        resetHeroTimer();
    };

    window.jumpHeroSlide = (index) => {
        currentHeroIndex = index;
        updateHero(heroMovies[currentHeroIndex]);
        updateDots();
        resetHeroTimer();
    };

    function resetHeroTimer() {
        if (heroTimer) clearInterval(heroTimer);
        heroTimer = setInterval(() => {
            if (heroMovies.length > 1) {
                currentHeroIndex = (currentHeroIndex + 1) % heroMovies.length;
                updateHero(heroMovies[currentHeroIndex]);
                updateDots();
            }
        }, 6000);
    }

    function updateDots() {
        const dotsEl = document.getElementById('hero-dots');
        if (!dotsEl || heroMovies.length === 0) return;
        dotsEl.innerHTML = heroMovies.map((_, i) =>
            `<span class="hero-dot ${i === currentHeroIndex ? 'active' : ''}" onclick="jumpHeroSlide(${i})"></span>`
        ).join('');
    }

    function updateHero(movie) {
        const heroBanner = document.getElementById('hero-banner');
        const heroContent = document.getElementById('hero-content');
        if (!heroBanner || !heroContent) return;

        const bgUrl = movie.backdrop_url || movie.poster_url || '';
        heroBanner.style.backgroundImage = `url('${bgUrl}')`;

        const rating = movie.age_rating || 'P';
        const stars = movie.avg_rating ? '⭐ ' + parseFloat(movie.avg_rating).toFixed(1) : '';

        heroContent.classList.add('hero-fade');
        setTimeout(() => {
            heroContent.innerHTML = `
                <div class="vh-play" onclick="openTrailer('${movie.trailer_url || ''}')">▶</div>
                <h1>${movie.title}</h1>
                <div class="vh-meta">
                    <span class="vh-age">${rating}</span>
                    ${stars ? `<span class="vh-stars">${stars}</span>` : ''}
                    <span class="vh-separator">•</span>
                    <span class="vh-text">${movie.duration_minutes ? movie.duration_minutes + ' phút' : ''}</span>
                    ${movie.genre ? `<span class="vh-separator">•</span><span class="vh-text">${formatGenre(movie.genre)}</span>` : ''}
                    ${movie.director ? `<span class="vh-separator">•</span><span class="vh-text">ĐD: ${movie.director}</span>` : ''}
                    ${movie.cast_members ? `<span class="vh-separator">•</span><span class="vh-text">DV: ${movie.cast_members}</span>` : ''}
                </div>
                ${movie.description ? `<p class="vh-desc">${movie.description.substring(0, 140)}...</p>` : ''}
                <div class="vh-actions">
                    <button class="btn-vue-outline" onclick="window.location.href='/booking.html?movie=${movie.slug}'">ĐẶT VÉ NGAY</button>
                    ${movie.trailer_url ? `<button class="btn-vue-ghost" onclick="openTrailer('${movie.trailer_url}')">▶ XEM TRAILER</button>` : ''}
                </div>
            `;
            heroContent.classList.remove('hero-fade');
            updateDots();
        }, 200);
    }

    function formatGenre(genreStr) {
        if (!genreStr) return '';
        const map = {
            'action': 'Hành động', 'drama': 'Tâm lý', 'comedy': 'Hài hước',
            'horror': 'Kinh dị', 'animation': 'Hoạt hình', 'scifi': 'Sci-Fi',
            'romance': 'Lãng mạn', 'thriller': 'Giật gân'
        };
        return genreStr.split(',').map(g => map[g.trim()] || g.trim()).join(', ');
    }

    function formatDisplayDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function getHoverPreviewUrl(url) {
        if (!url) return '';
        if (url.includes('youtube.com/embed/')) {
            return `${url}${url.includes('?') ? '&' : '?'}autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1`;
        }
        if (url.includes('youtube.com/watch')) {
            const converted = url.replace('watch?v=', 'embed/');
            return `${converted}${converted.includes('?') ? '&' : '?'}autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1`;
        }
        if (url.includes('youtu.be/')) {
            const id = url.split('youtu.be/')[1].split('?')[0];
            return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1`;
        }
        return url;
    }

    function attachMediaHoverPreview(container) {
        container.querySelectorAll('.media-preview-card').forEach((card) => {
            const iframe = card.querySelector('iframe');
            const previewUrl = card.dataset.previewUrl || '';
            if (!iframe || !previewUrl) return;

            let clearTimer = null;

            const startPreview = () => {
                if (clearTimer) clearTimeout(clearTimer);
                card.classList.add('is-playing');
                if (!iframe.dataset.loaded) {
                    iframe.src = previewUrl;
                    iframe.dataset.loaded = 'true';
                }
            };

            const stopPreview = () => {
                card.classList.remove('is-playing');
                clearTimer = setTimeout(() => {
                    iframe.src = '';
                    iframe.dataset.loaded = '';
                }, 120);
            };

            card.addEventListener('mouseenter', startPreview);
            card.addEventListener('mouseleave', stopPreview);
            card.addEventListener('focusin', startPreview);
            card.addEventListener('focusout', stopPreview);
        });
    }

    // ============ HOMEPAGE CONTENT ============
    async function loadHomepageContent() {
        await Promise.all([
            loadEvents(),
            loadArticles(),
            loadMediaItems()
        ]);
    }

    async function loadEvents() {
        const container = document.getElementById('events-list');
        if (!container) return;

        try {
            const events = await API.get('/api/content/events');
            if (!events.length) {
                container.innerHTML = '<p class="empty-state">Hiện chưa có sự kiện nào.</p>';
                return;
            }

            container.innerHTML = events.map(item => {
                const imageStyle = item.image_url
                    ? `background-image: linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55)), url('${item.image_url}');`
                    : `background:
                        radial-gradient(circle at 20% 20%, rgba(237,142,0,0.28), transparent 32%),
                        radial-gradient(circle at 80% 30%, rgba(255,185,0,0.16), transparent 28%),
                        linear-gradient(135deg, #171717 0%, #090909 45%, #000 100%);`;

                const textBlock = `
                    <div class="vue-split-text" style="background:${item.layout === 'text_right' ? 'transparent' : 'linear-gradient(110deg, #111 0%, #0a0a0a 100%)'};">
                        ${item.tag ? `<div class="split-tag">${item.tag}</div>` : ''}
                        <h2>${item.title}${item.accent_text ? ` <span style="color:#ED8E00">${item.accent_text}</span>` : ''}</h2>
                        ${item.description ? `<p>${item.description}</p>` : ''}
                        ${item.button_text ? `<button class="btn-vue-outline" onclick="window.location.href='${item.button_link || '#'}'">${item.button_text}</button>` : ''}
                    </div>
                `;

                const visualBlock = `<div class="vue-split-img" style="${imageStyle}"></div>`;

                return `
                    <div class="vue-split-banner" style="margin-bottom: 28px; min-height:380px;">
                        ${item.layout === 'text_right' ? `${visualBlock}${textBlock}` : `${textBlock}${visualBlock}`}
                    </div>
                `;
            }).join('');
            initScrollReveal();
        } catch (e) {
            container.innerHTML = '<p class="empty-state">Không thể tải sự kiện.</p>';
        }
    }

    async function loadArticles() {
        const container = document.getElementById('articles-grid');
        if (!container) return;

        try {
            const articles = await API.get('/api/content/articles');
            if (!articles.length) {
                container.innerHTML = '<p class="empty-state">Hiện chưa có bài viết nào.</p>';
                return;
            }

            container.innerHTML = articles.map(item => `
                <div class="vue-article">
                    <img src="${item.image_url || ''}" alt="${item.title}" loading="lazy" onerror="this.style.display='none'">
                    <div class="vue-article-meta"><span class="badge">${item.category_label || 'TIN TỨC'}</span> ${formatDisplayDate(item.published_date)}</div>
                    <h4>${item.title}</h4>
                    <a href="${item.link_url || '#'}" class="vue-article-link">Đọc thêm</a>
                </div>
            `).join('');
            initScrollReveal();
        } catch (e) {
            container.innerHTML = '<p class="empty-state">Không thể tải bài viết.</p>';
        }
    }

    async function loadMediaItems() {
        const container = document.getElementById('media-strip');
        if (!container) return;

        try {
            const items = await API.get('/api/content/media');
            if (!items.length) {
                container.innerHTML = '<p class="empty-state">Hiện chưa có trailer hoặc clip nào.</p>';
                return;
            }

            container.innerHTML = items.map(item => `
                <button
                    class="media-preview-card"
                    onclick="openTrailer('${item.video_url || ''}')"
                    title="${item.title}"
                    data-preview-url="${getHoverPreviewUrl(item.video_url || '')}"
                >
                    <span class="media-preview-poster">
                        <img src="${item.thumbnail_url || ''}" alt="${item.title}" onerror="this.style.display='none'">
                        <span class="media-preview-meta">${item.media_type === 'clip' ? 'CLIP' : 'TRAILER'}</span>
                        <span class="media-preview-play">▶</span>
                    </span>
                    <span class="media-preview-video">
                        <iframe
                            title="${item.title}"
                            loading="lazy"
                            allow="autoplay; encrypted-media; picture-in-picture"
                            referrerpolicy="strict-origin-when-cross-origin"
                        ></iframe>
                    </span>
                </button>
            `).join('');
            attachMediaHoverPreview(container);
            initScrollReveal();
        } catch (e) {
            container.innerHTML = '<p class="empty-state">Không thể tải trailer và clip.</p>';
        }
    }

    // ============ FETCH MOVIES ============
    async function fetchMovies(status, gridElement) {
        try {
            const movies = await API.get(`/api/movies/${status}`);

            if (status === 'now-showing') {
                allNowShowingMovies = movies;
                heroMovies = movies.filter(m => m.is_featured === 1);
                if (heroMovies.length === 0) heroMovies = movies.slice(0, 3); // Fallback

                if (heroMovies.length > 0) {
                    updateHero(heroMovies[0]);
                    resetHeroTimer();
                }
                populateQuickBookMovies(movies);
            } else {
                allComingSoonMovies = movies;
            }
            if (gridElement) displayMovies(movies, gridElement, status === 'coming-soon');
            initScrollReveal();
        } catch (error) {
            if (gridElement) gridElement.innerHTML = '<p class="empty-state">Không thể tải danh sách phim.</p>';
        }
    }

    function displayMovies(movies, gridElement, isComingSoon = false) {
        if (movies.length === 0) {
            gridElement.innerHTML = '<p class="empty-state">Hiện không có phim nào.</p>';
            return;
        }

        gridElement.innerHTML = movies.map(movie => {
            const ratingBadge = movie.avg_rating
                ? `<div class="film-rating">${parseFloat(movie.avg_rating).toFixed(1)}⭐</div>` : '';
            const genreTag = movie.genre
                ? `<div class="film-genre">${formatGenre(movie.genre)}</div>` : '';

            return `
            <div class="vue-film-card" onclick="window.location='/booking.html?movie=${movie.slug}'">
                <div class="film-poster-wrap">
                    <img src="${movie.poster_url || 'https://via.placeholder.com/300x450/111/ED8E00?text=No+Image'}" alt="${movie.title}" loading="lazy">
                    ${ratingBadge}
                    <div class="film-hover-overlay">
                        <button class="film-overlay-btn" onclick="event.stopPropagation(); window.location='/booking.html?movie=${movie.slug}'">${isComingSoon ? 'XEM CHI TIẾT' : 'ĐẶT VÉ'}</button>
                        ${movie.trailer_url ? `<button class="film-overlay-btn ghost" onclick="event.stopPropagation(); openTrailer('${movie.trailer_url}')">▶ TRAILER</button>` : ''}
                    </div>
                    ${movie.age_rating ? `<div class="film-age-badge">${movie.age_rating}</div>` : ''}
                </div>
                <div class="vue-film-title">${movie.title}</div>
                <div class="film-meta-line">
                    ${movie.duration_minutes ? `<span>${movie.duration_minutes} phút</span>` : ''}
                    ${genreTag}
                </div>
            </div>
        `}).join('');
    }

    // ============ GENRE FILTER ============
    window.filterByGenre = (genre, btn) => {
        document.querySelectorAll('.genre-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');

        if (genre === 'all') {
            displayMovies(allNowShowingMovies, movieGrid);
            return;
        }

        const filterMap = {
            'action': ['action', 'hành động'],
            'drama': ['drama', 'tâm lý', 'chính kịch'],
            'comedy': ['comedy', 'hài'],
            'horror': ['horror', 'kinh dị', 'kinh di'],
            'animation': ['animation', 'hoạt hình'],
            'scifi': ['scifi', 'sci-fi', 'viễn tưởng']
        };
        const allowed = filterMap[genre] || [genre];

        const filtered = allNowShowingMovies.filter(m => {
            if (!m.genre) return false;
            const g = m.genre.toLowerCase();
            return allowed.some(keyword => g.includes(keyword));
        });

        if (filtered.length === 0) {
            movieGrid.innerHTML = `<p class="empty-state">Không có phim "${btn.textContent}" đang chiếu.</p>`;
            return;
        }
        displayMovies(filtered, movieGrid);
    };

    // ============ TRAILER MODAL ============
    window.openTrailer = (url) => {
        if (!url) { showToast('Trailer hiện chưa có sẵn.', 'info'); return; }
        const trailerModal = document.getElementById('trailer-modal');
        const trailerVideo = document.getElementById('trailer-video');
        if (!trailerModal || !trailerVideo) return;

        let embedUrl = url;
        if (url.includes('youtube.com/watch')) embedUrl = url.replace('watch?v=', 'embed/') + '?autoplay=1';
        else if (url.includes('youtu.be/')) embedUrl = 'https://www.youtube.com/embed/' + url.split('youtu.be/')[1] + '?autoplay=1';
        else if (!url.includes('autoplay')) embedUrl += (url.includes('?') ? '&' : '?') + 'autoplay=1';

        trailerVideo.src = embedUrl;
        trailerModal.classList.add('show');
    };

    document.getElementById('close-trailer')?.addEventListener('click', closeTrailerModal);
    document.getElementById('trailer-modal')?.addEventListener('click', e => {
        if (e.target.id === 'trailer-modal') closeTrailerModal();
    });

    function closeTrailerModal() {
        const m = document.getElementById('trailer-modal');
        const v = document.getElementById('trailer-video');
        if (m) m.classList.remove('show');
        if (v) v.src = '';
    }

    // ============ SEARCH OVERLAY ============
    let searchDebounce = null;
    window.openSearchOverlay = () => {
        document.getElementById('search-overlay')?.classList.add('active');
        setTimeout(() => document.getElementById('search-input')?.focus(), 200);
    };
    window.closeSearchOverlay = () => {
        document.getElementById('search-overlay')?.classList.remove('active');
        const results = document.getElementById('search-results');
        const input = document.getElementById('search-input');
        if (results) results.innerHTML = '';
        if (input) input.value = '';
    };

    document.getElementById('search-overlay')?.addEventListener('click', e => {
        if (e.target.id === 'search-overlay') closeSearchOverlay();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeSearchOverlay();
            closeTrailerModal();
            closeMobileMenu();
        }
    });

    window.handleSearch = (query) => {
        clearTimeout(searchDebounce);
        const resultsEl = document.getElementById('search-results');
        if (!query.trim()) { resultsEl.innerHTML = ''; return; }

        searchDebounce = setTimeout(async () => {
            try {
                const all = [...allNowShowingMovies, ...allComingSoonMovies];
                const q = query.toLowerCase();
                const found = all.filter(m => m.title.toLowerCase().includes(q));

                if (found.length === 0) {
                    resultsEl.innerHTML = '<p class="search-empty">Không tìm thấy phim nào phù hợp.</p>';
                    return;
                }
                resultsEl.innerHTML = found.map(m => `
                    <div class="search-result-item" onclick="window.location='/booking.html?movie=${m.slug}'; closeSearchOverlay();">
                        <img src="${m.poster_url || ''}" alt="${m.title}">
                        <div class="sri-info">
                            <strong>${m.title}</strong>
                            <span>${m.duration_minutes ? m.duration_minutes + ' phút' : ''} ${m.age_rating ? '| ' + m.age_rating : ''}</span>
                            <span class="sri-status ${m.status === 'now_showing' ? 'showing' : 'soon'}">${m.status === 'now_showing' ? 'Đang chiếu' : 'Sắp chiếu'}</span>
                        </div>
                    </div>
                `).join('');
            } catch (e) {
                resultsEl.innerHTML = '<p class="search-empty">Lỗi tìm kiếm, vui lòng thử lại.</p>';
            }
        }, 250);
    };

    // ============ QUICK BOOK ============
    function populateQuickBookMovies(movies) {
        const sel = document.getElementById('qb-movie');
        if (!sel) return;
        sel.innerHTML = '<option value="">Chọn Phim</option>';
        movies.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.slug;
            opt.textContent = m.title;
            sel.appendChild(opt);
        });
        sel.onchange = () => {
            if (sel.value) populateQuickBookDates(sel.value);
        };
    }

    async function populateQuickBookDates(slug) {
        const dateSel = document.getElementById('qb-date');
        const timeSel = document.getElementById('qb-time');
        dateSel.innerHTML = '<option value="">Chọn Ngày</option>';
        timeSel.innerHTML = '<option value="">Chọn Giờ</option>';
        timeSel.disabled = true;

        try {
            const showtimes = await API.get(`/api/movies/${slug}/showtimes`);
            const dates = [...new Set(showtimes.map(s => s.show_date))];

            dates.forEach((d, i) => {
                const opt = document.createElement('option');
                opt.value = d;
                const date = new Date(d);
                const today = new Date().toISOString().split('T')[0];
                const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
                opt.textContent = d === today ? 'Hôm nay' : d === tomorrow ? 'Ngày mai'
                    : date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
                dateSel.appendChild(opt);
            });

            dateSel.onchange = () => {
                const filtered = showtimes.filter(s => s.show_date === dateSel.value);
                timeSel.innerHTML = '<option value="">Chọn Giờ</option>';
                filtered.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = `${formatTime(s.start_time)} - ${s.room_name} (${s.theater_name})`;
                    timeSel.appendChild(opt);
                });
                timeSel.disabled = false;
            };
        } catch (e) { /* silent */ }
    }

    window.quickBook = () => {
        const movie = document.getElementById('qb-movie')?.value;
        const time = document.getElementById('qb-time')?.value;
        if (!movie) { showToast('Vui lòng chọn phim!', 'error'); return; }
        window.location.href = `/booking.html?movie=${movie}${time ? '&showtime=' + time : ''}`;
    };

    window.goToVenueSchedule = () => {
        const v = document.getElementById('venue-search')?.value;
        if (!v) { showToast('Vui lòng chọn rạp!', 'info'); return; }
        showToast(`Đang tìm lịch chiếu tại ${v}...`, 'info');
    };

    // ============ INIT ============
    if (movieGrid) fetchMovies('now-showing', movieGrid);
    if (comingSoonGrid) fetchMovies('coming-soon', comingSoonGrid);
    loadHomepageContent();
    initScrollReveal();

    // Load theaters for quickbook venue
    loadTheaters();
});

async function loadTheaters() {
    try {
        const theaters = await API.get('/api/theaters');
        const venueList = document.getElementById('venue-list');
        const qbVenue = document.getElementById('qb-venue');
        
        if (venueList) {
            venueList.innerHTML = '';
            theaters.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                venueList.appendChild(opt);
            });
        }
        if (qbVenue) {
            qbVenue.innerHTML = '<option value="">Chọn Rạp</option>';
            theaters.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name;
                qbVenue.appendChild(opt);
            });
        }
    } catch (e) { /* silent */ }
}

// Back to Top button visibility
window.addEventListener('scroll', () => {
    const backToTop = document.querySelector('.vue-back-to-top');
    if (backToTop) {
        if (window.scrollY > window.innerHeight) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    }
});
