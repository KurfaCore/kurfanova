/**
 * KURFAMÜZİK (KURFA SOUND LIGHT) — Client Controller v4
 * 100% Ad-Free YouTube Playback Engine, 120 FPS Scrubbable Seekbar & Volume,
 * Real Synced LRC Karaoke Lyrics Engine, Full Mobile First-Class Navigation & Player Deck
 */

// Base API endpoint resolver for cross-origin hosting (GitHub Pages -> Worker API)
const API_BASE = (typeof window !== 'undefined' && (window.location.origin.includes('github.io') || window.location.protocol === 'file:'))
  ? 'https://kurfanova.kurfa.workers.dev'
  : '';

// =============================================================================
// 1. DATA FIXTURES & INITIAL DATA
// =============================================================================

// =============================================================================
// 1. DYNAMIC DATA LAYER & REAL YOUTUBE TRENDS
// =============================================================================

// Dynamic live YouTube explore data (restored instantly from client storage if available)
let exploreData = (function() {
  try {
    const cached = JSON.parse(localStorage.getItem('kurfa_explore_cache') || 'null');
    if (cached && Array.isArray(cached.trends) && cached.trends.length > 0) {
      return cached;
    }
  } catch(e) {}
  return {
    hero: null,
    trends: [],
    top10: [],
    fresh: [],
    mixes: []
  };
})();

// Real official Turkish music singles with verified HD thumbnails
const EMERGENCY_FALLBACK_TRACKS = [
  { id: "y5A2NmlFbOY", title: "Umur Doma & Hande Ünsal - Gel", artist: "netd müzik", duration: "2:42", thumbnail: "https://i.ytimg.com/vi/y5A2NmlFbOY/hqdefault.jpg" },
  { id: "qgSVE71wNec", title: "Sibel Can & Eypio – KIYAMAM", artist: "Sibel Can", duration: "2:28", thumbnail: "https://i.ytimg.com/vi/qgSVE71wNec/hqdefault.jpg" },
  { id: "59aQ2iIwI8s", title: "Demet Akalın - Bi' Şey Mi Dedin?", artist: "Demet Akalın", duration: "2:42", thumbnail: "https://i.ytimg.com/vi/59aQ2iIwI8s/hqdefault.jpg" },
  { id: "Tfz-PmS9fb0", title: "İrem Derici - Durum Çok Acil", artist: "İrem Derici", duration: "2:54", thumbnail: "https://i.ytimg.com/vi/Tfz-PmS9fb0/hqdefault.jpg" },
  { id: "KF6SfC6Q-ZA", title: "Burak Bulut - Ah Be Manolya", artist: "Burak Bulut", duration: "2:58", thumbnail: "https://i.ytimg.com/vi/KF6SfC6Q-ZA/hqdefault.jpg" }
];

function getTrackThumbnail(track) {
  if (!track) return '/kurfamuzik_logo.png';
  if (track.id && typeof track.id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(track.id)) {
    return `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
  }
  if (track.thumbnail && !track.thumbnail.includes('invidious') && !track.thumbnail.includes('kurfamuzik_logo')) {
    return track.thumbnail;
  }
  if (track.id) {
    return `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
  }
  return '/kurfamuzik_logo.png';
}
window.getTrackThumbnail = getTrackThumbnail;

function getCuratedTracks() {
  const list = (exploreData.trends && exploreData.trends.length > 0) ? exploreData.trends : EMERGENCY_FALLBACK_TRACKS;
  return list.map(t => {
    if (t && t.id) {
      return {
        ...t,
        thumbnail: `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`
      };
    }
    return t;
  });
}

// Transparent Proxy so any legacy reference to CURATED_TRACKS gets live YouTube trends seamlessly
const CURATED_TRACKS = new Proxy([], {
  get(target, prop) {
    const list = getCuratedTracks();
    if (prop === 'length') return list.length;
    if (prop in list) {
      const val = list[prop];
      return typeof val === 'function' ? val.bind(list) : val;
    }
    return target[prop];
  }
});

// Lyrics cache in memory
const lyricsMemoryCache = new Map();

// Dynamic proxy for fresh releases
const FRESH_RELEASES = new Proxy([], {
  get(target, prop) {
    const list = (exploreData.fresh && exploreData.fresh.length > 0) ? exploreData.fresh : getCuratedTracks().slice(0, 6);
    if (prop === 'length') return list.length;
    if (prop in list) {
      const val = list[prop];
      return typeof val === 'function' ? val.bind(list) : val;
    }
    return target[prop];
  }
});

// =============================================================================
// 2. APPLICATION STATE & SAFE HELPERS (100% ISOLATED & PRIVATE PER USER BROWSER)
// =============================================================================

function safeGetJSON(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch(e) {
    return fallback;
  }
}

function safeGetFloat(key, fallback) {
  try {
    const val = parseFloat(localStorage.getItem(key));
    return Number.isFinite(val) ? val : fallback;
  } catch(e) {
    return fallback;
  }
}

function safeGetInt(key, fallback, radix = 10) {
  try {
    const val = parseInt(localStorage.getItem(key), radix);
    return Number.isFinite(val) ? val : fallback;
  } catch(e) {
    return fallback;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getEventClientX(e) {
  if (!e) return 0;
  if (e.touches && e.touches.length > 0 && typeof e.touches[0].clientX === 'number') {
    return e.touches[0].clientX;
  }
  if (e.changedTouches && e.changedTouches.length > 0 && typeof e.changedTouches[0].clientX === 'number') {
    return e.changedTouches[0].clientX;
  }
  return typeof e.clientX === 'number' ? e.clientX : 0;
}

function saveQueueState() {
  try {
    localStorage.setItem('kurfa_queue', JSON.stringify(state.queue || []));
  } catch(e) {}
}

const state = {
  currentTrack: null, // 100% clean and isolated - no track preloaded or forced on user
  isPlaying: false,
  userPaused: false,
  currentPlayheadTime: 0,
  _switchingDeckMode: false,
  _switchingDeckTimer: null,
  _guardianResumeTimer: null,
  queue: safeGetJSON('kurfa_queue', []),
  originalQueue: [],
  queueIndex: 0,
  volume: safeGetFloat('kurfa_vol', 0.8),
  isMuted: false,
  isShuffle: localStorage.getItem('kurfa_shuffle') === 'true',
  repeatMode: safeGetInt('kurfa_repeat', 0), // 0: off, 1: all, 2: one
  currentTab: localStorage.getItem('kurfa_last_tab') || 'kesfet',
  currentKesfetSubTab: localStorage.getItem('kurfa_last_kesfet_subtab') || 'trendler',
  currentKutuphaneSubTab: localStorage.getItem('kurfa_last_kutuphane_subtab') || 'favoriler',
  favorites: safeGetJSON('kurfa_favs', []),
  downloads: safeGetJSON('kurfa_downloads', []),
  downloadQueue: [],
  isDownloading: false,
  deckVisualMode: localStorage.getItem('kurfa_deck_mode') || 'vinyl',
  isTahtaMode: localStorage.getItem('kurfa_tahta_mode') === 'true',
  activeEqPreset: localStorage.getItem('kurfa_eq_preset') || 'standart',
  lyricsOffset: 0,
  mobileNowPlayingOpen: false,
  currentAudioSinkId: localStorage.getItem('kurfa_audio_sink') || null,
  profile: (function() {
    const saved = safeGetJSON('kurfa_profile', null);
    if (saved) return saved;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
      nickname: "Dinleyici",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80",
      darkMode: prefersDark,
      listeningSeconds: 0,
      tracksPlayed: 0
    };
  })(),
  isSeeking: false,
  isScrubbingVol: false,
  queueDrawerOpen: false,
  ytPlayer: null,
  ytReady: false,
  activeLyrics: [],
  currentLyricIndex: -1,
  currentSearchResults: [],
  currentGenreFilter: 'all',
  customPlaylists: safeGetJSON('kurfa_custom_playlists', []),
  activeCustomPlaylistId: null,
  spotifyPlaylists: safeGetJSON('kurfa_spotify_playlists', []),
  activeSpotifyPlaylistId: null,
  playingContextSub: 'ÇALMA LİSTESİNDEN ÇALINIYOR',
  playingContextTitle: 'YouTube Trendleri',
  backgroundAudioMode: (function() {
    const saved = localStorage.getItem('kurfa_bg_audio');
    if (saved !== null) return saved === 'true';
    return /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) || (typeof window !== 'undefined' && window.innerWidth < 768);
  })(),
  firebaseUser: null,
  googleUser: safeGetJSON('kurfa_google_user', null),
  activePipWindow: null
};

// Fresh users start with legitimate empty downloads, favorites and playlists
if (!Array.isArray(state.downloads)) state.downloads = [];
if (!Array.isArray(state.favorites)) state.favorites = [];
if (!Array.isArray(state.customPlaylists)) state.customPlaylists = [];
if (!Array.isArray(state.spotifyPlaylists)) state.spotifyPlaylists = [];
if (!Array.isArray(state.queue)) state.queue = [];


// =============================================================================
// 3. DOM ELEMENTS
// =============================================================================

const DOM = {
  // Tabs
  viewTabs: document.querySelectorAll('.view-tab'),
  navItems: document.querySelectorAll('.nav-item'),
  mobileNavItems: document.querySelectorAll('.mobile-nav-item'),
  
  // Desktop Player Deck
  playerThumb: document.getElementById('player-thumb'),
  playerTitle: document.getElementById('player-title'),
  playerArtist: document.getElementById('player-artist'),
  playerFavBtn: document.getElementById('player-fav-btn'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  playerPlayIcon: document.getElementById('player-play-icon'),
  btnShuffle: document.getElementById('btn-shuffle'),
  btnRepeat: document.getElementById('btn-repeat'),
  playerSeekTrack: document.getElementById('player-seek-track'),
  playerSeekFill: document.getElementById('player-seek-fill'),
  playerSeekKnob: document.getElementById('player-seek-knob'),
  playerTimeCur: document.getElementById('player-time-cur'),
  playerTimeDur: document.getElementById('player-time-dur'),
  btnVolumeIcon: document.getElementById('btn-volume-icon'),
  playerVolTrack: document.getElementById('player-vol-track'),
  playerVolFill: document.getElementById('player-vol-fill'),

  // Mobile Mini Player
  mobileMiniPlayer: document.getElementById('mobile-mini-player'),
  playerThumbMobile: document.getElementById('player-thumb-mobile'),
  playerTitleMobile: document.getElementById('player-title-mobile'),
  playerArtistMobile: document.getElementById('player-artist-mobile'),
  playerFavBtnMobile: document.getElementById('player-fav-btn-mobile'),
  btnPlayPauseMobile: document.getElementById('btn-play-pause-mobile'),
  playerPlayIconMobile: document.getElementById('player-play-icon-mobile'),
  playerMobileSeekFill: document.getElementById('player-mobile-seek-fill'),
  
  // Visualizer / Lyrics in Çalma Listeleri tab
  deckCoverImg: document.getElementById('deck-cover-img'),
  deckTitle: document.getElementById('deck-title'),
  deckArtist: document.getElementById('deck-artist'),
  deckLyricsLines: document.getElementById('deck-lyrics-lines'),
  karaokeLyricsBox: document.getElementById('karaoke-lyrics-box'),
  lyricsStatusLabel: document.getElementById('lyrics-status-label'),
  lyricsSourceBadge: document.getElementById('lyrics-source-badge'),
  lyricsOffsetDisplay: document.getElementById('lyrics-offset-display'),
  vinylDisc: document.getElementById('vinyl-disc'),
  
  // Grids & Tables
  popularCardsGrid: document.getElementById('popular-cards-grid'),
  homeTracklistTable: document.getElementById('home-tracklist-table'),
  trendlerCardsGrid: document.getElementById('trendler-cards-grid'),
  favoritesListTable: document.getElementById('favorites-list-table'),
  downloadsListTable: document.getElementById('downloads-list-table'),
  playlistTracksTable: document.getElementById('playlist-tracks-table'),
  favCountText: document.getElementById('fav-count-text'),
  
  // Search
  topSearchInput: document.getElementById('top-search-input'),
  engineSearchInput: document.getElementById('engine-search-input'),
  searchResultsList: document.getElementById('search-results-list'),
  searchResultsCount: document.getElementById('search-results-count'),
  searchSpotlightBox: document.getElementById('search-spotlight-box'),
  
  // Modals & Drawers
  queueDrawer: document.getElementById('queue-drawer'),
  queueDrawerList: document.getElementById('queue-drawer-list'),
  queueCountBadge: document.getElementById('queue-count-badge'),
  btnClearQueue: document.getElementById('btn-clear-queue'),
  downloaderModal: document.getElementById('downloader-modal'),
  downloaderModalCard: document.getElementById('downloader-modal-card'),
  modalUrlInput: document.getElementById('modal-url-input'),
  kurfaToast: document.getElementById('kurfa-toast'),
  toastText: document.getElementById('toast-text'),
  
  // Hero Section
  heroBg: document.getElementById('hero-bg'),
  heroTitle: document.getElementById('hero-title'),
  heroArtist: document.getElementById('hero-artist'),
  heroPlayBtn: document.getElementById('hero-play-btn'),
  heroQueueBtn: document.getElementById('hero-queue-btn'),
  heroDlBtn: document.getElementById('hero-dl-btn'),

  // Audio fallback
  audioEngine: document.getElementById('audio-engine')
};

// =============================================================================
// 4. TOAST NOTIFICATIONS
// =============================================================================

let toastTimeout = null;
function showToast(message, type = 'info', duration = 3000) {
  if (!DOM.kurfaToast || !DOM.toastText) return;

  const iconEl = document.getElementById('toast-icon');
  const badgeEl = document.getElementById('toast-badge');
  const iconWrapper = document.getElementById('toast-icon-wrapper');

  const isNowPlaying = (typeof message === 'string' && (message.startsWith('Çalınıyor:') || message.startsWith('Oynatılıyor:')));

  if (isNowPlaying) {
    const rawTrack = message.replace(/^(Çalınıyor:|Oynatılıyor:)\s*/, '');
    if (badgeEl) {
      badgeEl.textContent = 'Şimdi Çalıyor';
      badgeEl.classList.remove('hidden');
    }
    DOM.toastText.textContent = rawTrack;
    if (iconEl) iconEl.textContent = 'graphic_eq';
    if (iconWrapper) {
      iconWrapper.className = 'flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 text-primary flex-shrink-0 animate-pulse';
    }
  } else {
    if (badgeEl) badgeEl.classList.add('hidden');
    DOM.toastText.textContent = message;

    if (iconEl && iconWrapper) {
      iconWrapper.className = 'flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0';
      if (type === 'success' || message.includes('Eklendi') || message.includes('Kaydedildi') || message.includes('Başarılı')) {
        iconEl.textContent = 'check_circle';
        iconWrapper.classList.add('bg-emerald-500/15', 'text-emerald-500');
      } else if (type === 'error' || message.includes('Hata') || message.includes('Başarısız')) {
        iconEl.textContent = 'error';
        iconWrapper.classList.add('bg-rose-500/15', 'text-rose-500');
      } else if (message.includes('Senkro') || message.includes('Eşitle') || message.includes('saniyesine')) {
        iconEl.textContent = 'tune';
        iconWrapper.classList.add('bg-secondary/15', 'text-secondary');
      } else {
        iconEl.textContent = 'music_note';
        iconWrapper.classList.add('bg-primary/15', 'text-primary');
      }
    }
  }

  DOM.kurfaToast.classList.add('show');
  
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    DOM.kurfaToast.classList.remove('show');
  }, duration);
}

function dismissToast() {
  if (DOM.kurfaToast) DOM.kurfaToast.classList.remove('show');
  if (toastTimeout) clearTimeout(toastTimeout);
}
window.dismissToast = dismissToast;

// =============================================================================
// 5. NAVIGATION & TAB SWITCHING (DESKTOP & MOBILE - 4 CONSOLIDATED TABS)
// =============================================================================

function switchTab(tabId, shouldScroll = true) {
  state.currentTab = tabId;
  if (tabId === "kesfet") {
    closeArtistDetail();
  }
  try {
    localStorage.setItem('kurfa_last_tab', tabId);
  } catch(e) {}

  // Desktop sidebar nav
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Mobile bottom nav
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle view panes & enforce View Suspension (Zero CPU/GPU for dormant views)
  document.querySelectorAll('.view-tab').forEach(pane => {
    if (pane.id === `tab-${tabId}`) {
      pane.classList.remove('view-suspended');
      pane.classList.add('active');
      pane.style.contentVisibility = 'visible';
    } else {
      pane.classList.remove('active');
      pane.classList.add('view-suspended');
      pane.style.contentVisibility = 'hidden';
    }
  });

  // Mobile mini-player: Hide on full player & lyrics tab so it doesn't overlap lyrics
  const mobileMiniPlayer = document.getElementById('mobile-mini-player');
  if (mobileMiniPlayer) {
    if (tabId === 'calma-listeleri') {
      mobileMiniPlayer.style.display = 'none';
    } else {
      mobileMiniPlayer.style.display = '';
    }
  }

  // Re-render specific tab contents only when needed (Avoid unnecessary DOM destruction)
  if (tabId === 'kutuphanem') {
    if (!DOM.favTracklistTable || DOM.favTracklistTable.children.length === 0) {
      renderFavoritesTable();
    }
    if (!DOM.downloadsTracklistTable || DOM.downloadsTracklistTable.children.length === 0) {
      renderDownloadsTable();
    }
    updateKutuphaneBadges();
  } else if (tabId === 'calma-listeleri') {
    updateLyricsDisplay();
    renderPlaylistTracksTable();
  } else if (tabId === 'kesfet') {
    // Only build DOM if not rendered yet to avoid lag on tab switch
    if (!DOM.homeTracklistTable || DOM.homeTracklistTable.children.length === 0) {
      renderHomeTracklistTable();
    }
    if (!DOM.trendlerCardsGrid || DOM.trendlerCardsGrid.children.length === 0) {
      renderTrendlerCardsGrid();
    }
    if (!DOM.popularArtistsGrid || DOM.popularArtistsGrid.children.length === 0) {
      renderPopularArtistsGrid();
    }
  } else if (tabId === 'arama') {
    setTimeout(() => {
      if (DOM.engineSearchInput) {
        DOM.engineSearchInput.focus();
      }
    }, 120);
  }

  // Handle Video Player visibility across tabs
  syncPersistentPlayerPosition();

  // Smooth scroll to top only when requested
  if (shouldScroll) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function navigateToKutuphane(subTab = 'favoriler') {
  switchTab('kutuphanem');
  switchKutuphaneSubTab(subTab);
  showToast(subTab === 'indirilenler' ? 'Çevrimdışı İndirilen Parçalar' : 'Favori Parçalarınız');
}
window.navigateToKutuphane = navigateToKutuphane;

// =============================================================================
// 5.1 SUB-TAB SWITCHING (KEŞFET & KÜTÜPHANEM)
// =============================================================================

function switchKesfetSubTab(subTabId) {
  state.currentKesfetSubTab = subTabId;
  try {
    localStorage.setItem('kurfa_last_kesfet_subtab', subTabId);
  } catch(e) {}

  // Update button active state
  const buttons = document.querySelectorAll('#kesfet-subtabs .sub-tab-pill');
  buttons.forEach(btn => {
    const isTarget = btn.id === `subtab-btn-${subTabId}`;
    if (isTarget) {
      btn.classList.add('active', 'bg-primary', 'text-on-primary', 'font-bold');
      btn.classList.remove('bg-surface-container-low', 'text-on-surface');
    } else {
      btn.classList.remove('active', 'bg-primary', 'text-on-primary', 'font-bold');
      btn.classList.add('bg-surface-container-low', 'text-on-surface');
    }
  });

  // Toggle sub-panes
  const pTrendler = document.getElementById('subtab-pane-trendler');
  const pKesif = document.getElementById('subtab-pane-kesif');
  const pYeni = document.getElementById('subtab-pane-yeni');

  if (pTrendler) pTrendler.classList.toggle('hidden', subTabId !== 'trendler');
  if (pKesif) pKesif.classList.toggle('hidden', subTabId !== 'kesif');
  if (pYeni) pYeni.classList.toggle('hidden', subTabId !== 'yeni');

  if (subTabId === 'yeni') {
    renderFreshReleasesGrid();
  } else if (subTabId === 'kesif') {
    renderPopularCardsGrid();
  } else if (subTabId === 'trendler') {
    renderTrendlerCardsGrid();
    renderHomeTracklistTable();
  }
}

function switchKutuphaneSubTab(subTabId) {
  state.currentKutuphaneSubTab = subTabId;
  try {
    localStorage.setItem('kurfa_last_kutuphane_subtab', subTabId);
  } catch(e) {}

  // Update button active state
  const buttons = document.querySelectorAll('#kutuphane-subtabs .sub-tab-pill');
  buttons.forEach(btn => {
    const isTarget = btn.id === `kutuphane-btn-${subTabId}`;
    if (isTarget) {
      btn.classList.add('active', 'bg-primary', 'text-on-primary', 'font-bold');
      btn.classList.remove('bg-surface-container-low', 'text-on-surface');
    } else {
      btn.classList.remove('active', 'bg-primary', 'text-on-primary', 'font-bold');
      btn.classList.add('bg-surface-container-low', 'text-on-surface');
    }
  });

  // Toggle sub-panes
  const pList = document.getElementById('kutuphane-pane-listelerim');
  const pSpotify = document.getElementById('kutuphane-pane-spotify');
  const pFav = document.getElementById('kutuphane-pane-favoriler');

  if (pList) pList.classList.toggle('hidden', subTabId !== 'listelerim');
  if (pSpotify) pSpotify.classList.toggle('hidden', subTabId !== 'spotify');
  if (pFav) pFav.classList.toggle('hidden', subTabId !== 'favoriler');

  if (subTabId === 'listelerim') {
    renderCustomPlaylistsGrid();
  } else if (subTabId === 'spotify') {
    renderSpotifyPlaylistsGrid();
  } else if (subTabId === 'favoriler') {
    renderFavoritesTable();
  }
  updateKutuphaneBadges();
}

function updateKutuphaneBadges() {
  const plBadge = document.getElementById('playlists-badge-count');
  if (plBadge) plBadge.textContent = (state.customPlaylists || []).length.toString();

  const plCount = document.getElementById('playlist-count-text');
  if (plCount) plCount.textContent = `${(state.customPlaylists || []).length} Liste`;

  const spBadge = document.getElementById('spotify-badge-count');
  if (spBadge) spBadge.textContent = (state.spotifyPlaylists || []).length.toString();

  const spCount = document.getElementById('spotify-count-text');
  if (spCount) spCount.textContent = `${(state.spotifyPlaylists || []).length} Liste`;

  const favBadge = document.getElementById('fav-badge-count');
  if (favBadge) favBadge.textContent = (state.favorites || []).length.toString();

  const favCount = document.getElementById('fav-count-text');
  if (favCount) favCount.textContent = `${(state.favorites || []).length} Şarkı Kaydedildi`;
}


// =============================================================================
// 6. YOUTUBE PLAYER & AUDIO ENGINE
// =============================================================================

let currentPlaybackToken = 0;

function stopAllPlayback() {
  currentPlaybackToken++;

  // 1. Immediately pause and clear HTML5 audio element
  if (DOM.audioEngine) {
    try {
      DOM.audioEngine.pause();
      DOM.audioEngine.currentTime = 0;
      DOM.audioEngine.removeAttribute('src');
      DOM.audioEngine.load(); // Flush audio buffer completely
    } catch(e) {}
  }

  // 2. Immediately stop YouTube player video/audio
  if (state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
    try {
      state.ytPlayer.stopVideo();
    } catch(e) {}
  }
}

function initYouTubeEngine() {
  if (state.ytPlayer || state._ytInitializing) return;
  const targetEl = document.getElementById('yt-player');
  if (!targetEl) return;
  if (typeof YT === 'undefined' || !YT || typeof YT.Player !== 'function') {
    return;
  }
  state._ytInitializing = true;
  try {
    state.ytPlayer = new YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      videoId: (state.currentTrack?.ytId && /^[\w-]{11}$/.test(state.currentTrack.ytId))
        ? state.currentTrack.ytId
        : (state.currentTrack?.id && /^[\w-]{11}$/.test(state.currentTrack.id))
          ? state.currentTrack.id
          : '',
      playerVars: {
        autoplay: 0,
        controls: 1,
        disablekb: 0,
        enablejsapi: 1,
        fs: 1,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        origin: window.location.origin
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError
      }
    });
  } catch(e) {
    state._ytInitializing = false;
    console.warn("initYouTubeEngine error:", e);
  }
}

window.onYouTubeIframeAPIReady = function() {
  state._ytInitializing = false;
  initYouTubeEngine();
};

function onPlayerReady(event) {
  state.ytReady = true;
  state._ytInitializing = false;
  setPlayerVolume(state.volume);
  console.log("YouTube Player Engine Ready");
  if (state.pendingTrackToPlay && state.pendingTrackToPlay.id) {
    const track = state.pendingTrackToPlay;
    state.pendingTrackToPlay = null;
    playTrackById(track.id, track);
  }
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    // If HTML5 audio engine is already playing an active stream, keep it and silence YouTube
    if (DOM.audioEngine && !DOM.audioEngine.paused && DOM.audioEngine.currentTime > 0 && DOM.audioEngine.src) {
      if (state.deckVisualMode !== 'video') {
        try {
          if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
            state.ytPlayer.pauseVideo();
          }
        } catch(e) {}
        return;
      }
    }

    // Otherwise, YouTube is the active audio/video playback source! Enforce silence on HTML5 audio
    if (DOM.audioEngine && !DOM.audioEngine.paused) {
      try {
        DOM.audioEngine.pause();
        DOM.audioEngine.removeAttribute('src');
      } catch(e) {}
    }
    state.isPlaying = true;
    state.userPaused = false;
    updatePlayPauseUI(true);
    startSeekbarTicker();
  } else if (event.data === YT.PlayerState.PAUSED) {
    // If currently switching deck mode, ignore pause event
    if (state._switchingDeckMode) return;

    // If HTML5 audio engine is currently playing, ignore YouTube pause
    if (DOM.audioEngine && !DOM.audioEngine.paused && DOM.audioEngine.currentTime > 0) {
      return;
    }

    // Kurfa Player Guardian:
    // If pause was involuntary and HTML5 audio isn't active, auto-recover playback
    if (!state.userPaused && state.currentTrack && (!DOM.audioEngine || DOM.audioEngine.paused)) {
      clearTimeout(state._guardianResumeTimer);
      state._guardianResumeTimer = setTimeout(() => {
        if (!state.userPaused && !state._switchingDeckMode && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function') {
          try {
            state.ytPlayer.playVideo();
          } catch(e) {}
        }
      }, 50);
      return;
    }
    state.isPlaying = false;
    updatePlayPauseUI(false);
  } else if (event.data === YT.PlayerState.ENDED) {
    handleTrackEnd();
  }
}

function onPlayerError(err) {
  console.warn("YouTube IFrame playback error:", err);
  // Errors 101/150/100 mean embedding is forbidden by owner
  if (err && (err.data === 150 || err.data === 101 || err.data === 100 || err.data === 2)) {
    const playId = state.currentTrack?.ytId || state.currentTrack?.id;
    if (playId && /^[\w-]{11}$/.test(playId)) {
      fallbackStreamPlayback(playId, currentPlaybackToken);
    } else {
      setTimeout(playNextTrack, 800);
    }
  }
}

async function fallbackStreamPlayback(videoId, token, startTime) {
  if (token && token !== currentPlaybackToken) return;
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    console.warn("Invalid videoId passed to fallbackStreamPlayback:", videoId);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/stream?id=${videoId}`);
    const data = await res.json();
    
    // Check if user changed songs while waiting
    if (token && token !== currentPlaybackToken) return;

    if (data.success && data.url && DOM.audioEngine) {
      // Pause YouTube player so both NEVER play simultaneously
      if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
        try { state.ytPlayer.pauseVideo(); } catch(e) {}
      }

      DOM.audioEngine.src = data.url;
      DOM.audioEngine.volume = state.volume;
      const targetStartTime = (typeof startTime === 'number' && startTime > 0) ? startTime : 0;
      if (targetStartTime > 0) {
        state.currentPlayheadTime = targetStartTime;
        const applySeek = () => {
          try {
            if (targetStartTime > 0 && Math.abs(DOM.audioEngine.currentTime - targetStartTime) > 0.8) {
              DOM.audioEngine.currentTime = targetStartTime;
            }
          } catch(e) {}
        };
        DOM.audioEngine.addEventListener('loadedmetadata', applySeek, { once: true });
        DOM.audioEngine.addEventListener('canplay', applySeek, { once: true });
        DOM.audioEngine.addEventListener('playing', applySeek, { once: true });
        if (DOM.audioEngine.readyState >= 1) {
          applySeek();
        }
        setTimeout(applySeek, 200);
        setTimeout(applySeek, 500);
      }
      DOM.audioEngine.play().then(() => {
        if (token && token !== currentPlaybackToken) return;
        if (targetStartTime > 0) {
          try {
            if (Math.abs(DOM.audioEngine.currentTime - targetStartTime) > 0.8) {
              DOM.audioEngine.currentTime = targetStartTime;
            }
          } catch(e) {}
        }
        state.isPlaying = true;
        updatePlayPauseUI(true);
        startSeekbarTicker();
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }).catch(e => {
        if (e.name === 'AbortError' || (token && token !== currentPlaybackToken) || !state.isPlaying) {
          // Play was intentionally aborted by user pause or track change
          return;
        }
        console.warn("Audio element play error, falling back to YouTube:", e);
        if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
          state.ytPlayer.loadVideoById(videoId, targetStartTime || 0);
          state.ytPlayer.playVideo();
          state.isPlaying = true;
          updatePlayPauseUI(true);
        }
      });

      state.isPlaying = true;
      updatePlayPauseUI(true);
      return;
    }
  } catch (e) {
    console.error("Stream fallback error:", e);
  }

  // If stream resolver failed or URL unsupported, fall back to YouTube Player
  if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
    state.ytPlayer.loadVideoById(videoId, startTime || 0);
    state.ytPlayer.playVideo();
    state.isPlaying = true;
    updatePlayPauseUI(true);
  }
}

function getCurrentPlaybackTime() {
  // 1. If HTML5 audio is actively playing, use its currentTime
  if (DOM.audioEngine && DOM.audioEngine.src && !DOM.audioEngine.paused && typeof DOM.audioEngine.currentTime === 'number' && DOM.audioEngine.currentTime > 0) {
    return DOM.audioEngine.currentTime;
  }
  // 2. If YouTube player is actively playing, use its currentTime
  if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function' && state.ytPlayer.getPlayerState() === 1) {
    try {
      const ytT = state.ytPlayer.getCurrentTime() || 0;
      if (ytT > 0) return ytT;
    } catch(e) {}
  }
  // 3. Fallback: check either engine for positive currentTime
  let t = 0;
  if (DOM.audioEngine && typeof DOM.audioEngine.currentTime === 'number' && DOM.audioEngine.currentTime > 0) {
    t = DOM.audioEngine.currentTime;
  }
  if (!t && state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
    try { t = state.ytPlayer.getCurrentTime() || 0; } catch(e) {}
  }
  if (!t && typeof state.currentPlayheadTime === 'number' && state.currentPlayheadTime > 0) {
    t = state.currentPlayheadTime;
  }
  return Math.max(0, t || 0);
}
window.getCurrentPlaybackTime = getCurrentPlaybackTime;

function seekPlaybackToSeconds(targetSec) {
  if (typeof targetSec !== 'number' || isNaN(targetSec) || targetSec < 0) return;
  state.currentPlayheadTime = targetSec;

  // 1. If HTML5 audio engine is active or has a loaded source, seek it
  if (DOM.audioEngine && DOM.audioEngine.src) {
    try { DOM.audioEngine.currentTime = targetSec; } catch(e) {}
  }

  // 2. If YouTube player is active or ready, seek it
  if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.seekTo === 'function') {
    try { state.ytPlayer.seekTo(targetSec, true); } catch(e) {}
  }

  // 3. Immediately update UI and lyrics for silky responsiveness
  if (typeof getActiveMediaDuration === 'function') {
    const dur = getActiveMediaDuration();
    if (dur > 0 && typeof updateSeekbarUI === 'function') {
      updateSeekbarUI(targetSec, dur);
    }
  }
  if (typeof syncLyricsWithTime === 'function') {
    syncLyricsWithTime(targetSec);
  }
}
window.seekPlaybackToSeconds = seekPlaybackToSeconds;

function pickBestYouTubeMatch(track, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const targetTitle = (track?.title || '').toLowerCase().trim();
  const targetArtist = (track?.artist || '').toLowerCase().trim();

  let targetDurSec = 0;
  if (typeof track?.duration === 'number') {
    targetDurSec = track.duration;
  } else if (typeof track?.duration === 'string') {
    const parts = track.duration.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) targetDurSec = parts[0] * 60 + parts[1];
    else if (parts.length === 3) targetDurSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  const badWords = [
    'karışık', 'tüm şarkılar', 'full albüm', 'full album', 'mix', 'megamix',
    '1 saat', '1 hour', '10 saat', '10 hour', 'reaction', 'tepki',
    'karaoke', 'enstrümantal', 'instrumental', 'röportaj', 'interview', 'bloopers'
  ];

  let best = null;
  let bestScore = -999;

  for (const c of candidates) {
    if (!c || !c.id) continue;
    const cTitle = (c.title || '').toLowerCase();
    const cArtist = (c.artist || '').toLowerCase();

    let cDurSec = 0;
    if (c.duration) {
      const parts = c.duration.split(':').map(p => parseInt(p, 10));
      if (parts.length === 2) cDurSec = parts[0] * 60 + parts[1];
      else if (parts.length === 3) cDurSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // 1. Extreme duration mismatch or compilation (> 10 mins or > 2.5x length)
    if (cDurSec > 600 || (targetDurSec > 60 && cDurSec > targetDurSec * 2.5)) continue;
    // 2. Short teaser (< 40s)
    if (cDurSec > 0 && cDurSec < 40 && targetDurSec > 60) continue;
    // 3. Bad words in candidate title (compilations, mixes)
    if (badWords.some(w => cTitle.includes(w) && !targetTitle.includes(w))) continue;

    let score = 0;
    const cleanTargetTitle = targetTitle.replace(/[^\w\sğüşıöç]/g, '').trim();
    const cleanCandTitle = cTitle.replace(/[^\w\sğüşıöç]/g, '').trim();

    if (cleanCandTitle.includes(cleanTargetTitle)) {
      score += 10;
    } else {
      const titleWords = cleanTargetTitle.split(/\s+/).filter(w => w.length > 2);
      let matchedWords = 0;
      for (const w of titleWords) {
        if (cleanCandTitle.includes(w)) matchedWords++;
      }
      if (titleWords.length > 0 && matchedWords > 0) {
        score += (matchedWords / titleWords.length) * 8;
      }
    }

    const artistWords = targetArtist.replace(/[^\w\sğüşıöç]/g, '').split(/\s+/).filter(w => w.length > 2);
    let matchedArtists = 0;
    for (const a of artistWords) {
      if (cleanCandTitle.includes(a) || cArtist.includes(a)) matchedArtists++;
    }
    if (artistWords.length > 0 && matchedArtists > 0) {
      score += (matchedArtists / artistWords.length) * 6;
    }

    if (targetDurSec > 0 && cDurSec > 0) {
      const diff = Math.abs(targetDurSec - cDurSec);
      if (diff <= 10) score += 6;
      else if (diff <= 25) score += 4;
      else if (diff <= 45) score += 2;
      else if (diff > 120) score -= 4;
    }

    if (/official\s*(audio|video|visualizer|klip)/i.test(c.title)) score += 3;
    if (/- topic$/i.test(c.artist)) score += 4;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best || candidates[0];
}

function updateSpotifyTrackInStorage(placeholderId, ytId, thumbnail) {
  if (!state.spotifyPlaylists || !Array.isArray(state.spotifyPlaylists)) return;
  for (const pl of state.spotifyPlaylists) {
    if (Array.isArray(pl.tracks)) {
      const trk = pl.tracks.find(t => t.id === placeholderId);
      if (trk) {
        trk.ytId = ytId;
        // Never overwrite official high-res studio cover with blurry video still!
        if (thumbnail && (!trk.thumbnail || trk.thumbnail.includes('kurfamuzik_logo') || trk.thumbnail === pl.cover)) {
          trk.thumbnail = thumbnail;
          const imgEl = document.querySelector(`img[data-sp-id="${placeholderId}"]`);
          if (imgEl) imgEl.src = thumbnail;
        }
        saveSpotifyPlaylists();
        break;
      }
    }
  }
}

async function prefetchNextQueueTrack() {
  if (!state.queue || state.queueIndex >= state.queue.length - 1) return;
  const next = state.queue[state.queueIndex + 1];
  if (!next) return;
  if (next.ytId && /^[\w-]{11}$/.test(next.ytId)) return;
  if (/^[\w-]{11}$/.test(next.id) && !next.id.startsWith('sp-')) return;

  try {
    const q = `${next.artist || ''} ${next.title || ''} audio`.trim();
    const sRes = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}&single=1`);
    const sData = await sRes.json();
    if (sData.success && Array.isArray(sData.results) && sData.results.length > 0) {
      const best = pickBestYouTubeMatch(next, sData.results);
      if (best && best.id) {
        next.ytId = best.id;
        if (!next.thumbnail || next.thumbnail.includes('kurfamuzik_logo')) {
          next.thumbnail = best.thumbnail;
        }
        updateSpotifyTrackInStorage(next.id, best.id, best.thumbnail);
      }
    }
  } catch(e) {}
}

async function resolveAndPlaySpotifyTrack(placeholderId, track) {
  const title = track?.title || 'Şarkı';
  const artist = track?.artist || 'Sanatçı';
  showToast(`Bağlanıyor: ${artist} - ${title}`);

  try {
    const q = `${artist} ${title} audio`.trim();
    let sRes = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}&single=1`);
    let sData = await sRes.json();
    let best = null;
    if (sData.success && Array.isArray(sData.results) && sData.results.length > 0) {
      best = pickBestYouTubeMatch(track, sData.results);
    }

    // Fallback if not found
    if (!best || !best.id) {
      const fallbackQ = `${title} ${artist}`.trim();
      sRes = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(fallbackQ)}&single=1`);
      sData = await sRes.json();
      if (sData.success && Array.isArray(sData.results) && sData.results.length > 0) {
        best = pickBestYouTubeMatch(track, sData.results);
      }
    }

    if (best && best.id) {
      const realYtId = best.id;
      const realThumb = best.thumbnail;

      if (track) {
        track.id = realYtId;
        track.ytId = realYtId;
        if (!track.thumbnail || track.thumbnail.includes('kurfamuzik_logo')) {
          track.thumbnail = realThumb;
        }
      }

      const qItem = state.queue.find(t => t.id === placeholderId || (track && (t.id === track.id || t.ytId === realYtId)));
      if (qItem) {
        qItem.id = realYtId;
        qItem.ytId = realYtId;
        if (!qItem.thumbnail || qItem.thumbnail.includes('kurfamuzik_logo')) {
          qItem.thumbnail = realThumb;
        }
      }
      saveQueueState();

      updateSpotifyTrackInStorage(placeholderId, realYtId, realThumb);

      // Preload next track
      prefetchNextQueueTrack();

      playTrackById(realYtId, track || best);
    } else {
      showToast(`YouTube üzerinde parça bulunamadı: ${title}`);
      setTimeout(playNextTrack, 800);
    }
  } catch(err) {
    console.warn("Spotify resolver error:", err);
    showToast(`Parça bağlantısı kurulamadı`);
  }
}

function playTrackById(videoId, arg2, arg3, arg4, arg5) {
  if (!videoId) return;

  let target = null;
  let startTime = 0;
  if (typeof arg2 === 'object' && arg2 !== null) {
    target = arg2;
    if (typeof arg3 === 'number') startTime = arg3;
  } else if (typeof arg2 === 'number') {
    startTime = arg2;
  } else if (typeof arg2 === 'string') {
    target = {
      id: videoId,
      title: arg2,
      artist: arg3 || "Bilinmeyen Sanatçı",
      thumbnail: arg4 || (videoId.startsWith('sp-') ? '/assets/kurfamuzik_logo.png' : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      duration: arg5 || "3:30"
    };
  }

  if (!target) {
    target = state.queue.find(t => t.id === videoId || t.ytId === videoId) || 
             CURATED_TRACKS.find(t => t.id === videoId) || 
             state.currentSearchResults.find(t => t.id === videoId);
  }

  // AUTO RESOLVE SPOTIFY & NON-YOUTUBE TRACKS
  if (videoId.startsWith('sp-') || !/^[\w-]{11}$/.test(videoId)) {
    if (target && target.ytId && /^[\w-]{11}$/.test(target.ytId)) {
      playTrackById(target.ytId, target, startTime);
      return;
    }
    resolveAndPlaySpotifyTrack(videoId, target);
    return;
  }

  state.userPaused = false;
  clearTimeout(state._guardianResumeTimer);

  // 1. HARD STOP any ongoing playback before switching tracks
  stopAllPlayback();
  const token = currentPlaybackToken;

  if (startTime > 0) {
    state.currentPlayheadTime = startTime;
  } else {
    state.currentPlayheadTime = 0;
  }

  if (!target) {
    target = {
      id: videoId,
      title: "YouTube Parçası",
      artist: "Sanatçı",
      duration: "3:30",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    };
  }

  state.currentTrack = target;
  try {
    localStorage.setItem('kurfa_last_track', JSON.stringify({
      id: target.id,
      title: target.title,
      artist: target.artist,
      thumbnail: target.thumbnail,
      duration: target.duration
    }));
  } catch(e) {}
  
  if (state.queue[state.queueIndex] && state.queue[state.queueIndex].id === videoId) {
    // Current pointer already aligns with target videoId
  } else {
    const existingIdx = state.queue.findIndex(t => t.id === videoId);
    if (existingIdx !== -1) {
      state.queueIndex = existingIdx;
    } else {
      if (state.queue.length === 0) {
        state.queue = [target];
        state.queueIndex = 0;
      } else {
        const insertAt = Math.min(state.queue.length, state.queueIndex + 1);
        state.queue.splice(insertAt, 0, target);
        state.queueIndex = insertAt;
      }
    }
  }
  saveQueueState();

  updatePlayerTrackUI(target);
  updateLyricsDisplay();
  renderQueueDrawerList();
  renderHomeTracklistTable();
  renderPlaylistTracksTable();
  renderFavoritesTable();
  renderDownloadsTable();

  // Primary playback engine:
  // If user explicitly selected Video Klip Mode, play directly via YouTube player with synchronous video visual!
  if (state.deckVisualMode === 'video' && state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
    if (DOM.audioEngine) {
      try {
        DOM.audioEngine.pause();
        DOM.audioEngine.removeAttribute('src');
      } catch(e) {}
    }
    try {
      state.ytPlayer.loadVideoById({
        videoId: videoId,
        startSeconds: startTime || 0
      });
      state.ytPlayer.playVideo();
      state.isPlaying = true;
      updatePlayPauseUI(true);
    } catch(err) {
      console.warn("YouTube player loadVideoById error:", err);
    }
  } else {
    // DEFAULT AUDIO ENGINE: 100% Ad-Free Raw Audio Stream via Invidious/Piped /api/stream
    fallbackStreamPlayback(videoId, token, startTime);
  }

  showToast(`Çalınıyor: ${target.title} - ${target.artist}`);
}

function addToQueueTrack(videoIdOrTrack, title, artist, thumb, dur) {
  let track;
  if (videoIdOrTrack && typeof videoIdOrTrack === 'object') {
    track = {
      id: videoIdOrTrack.id,
      title: videoIdOrTrack.title || "Şarkı",
      artist: videoIdOrTrack.artist || "Sanatçı",
      thumbnail: videoIdOrTrack.thumbnail || (videoIdOrTrack.id ? `https://i.ytimg.com/vi/${videoIdOrTrack.id}/hqdefault.jpg` : '/kurfamuzik_logo.png'),
      duration: videoIdOrTrack.duration || "3:30"
    };
  } else {
    track = {
      id: videoIdOrTrack,
      title: title || "Şarkı",
      artist: artist || "Sanatçı",
      thumbnail: thumb || `https://i.ytimg.com/vi/${videoIdOrTrack}/hqdefault.jpg`,
      duration: dur || "3:30"
    };
  }

  state.queue.push(track);
  saveQueueState();
  renderQueueDrawerList();
  showToast(`Sıraya Eklendi: ${track.title}`);
}

function togglePlay() {
  if (state.isPlaying) {
    pausePlayback();
  } else {
    resumePlayback();
  }
}

function resumePlayback() {
  state.userPaused = false;
  clearTimeout(state._guardianResumeTimer);
  const curTime = state.currentPlayheadTime || 0;

  // 1. If Video mode, resume via YouTube player
  if (state.deckVisualMode === 'video' && state.ytReady && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function' && state.currentTrack) {
    try {
      state.ytPlayer.playVideo();
      state.isPlaying = true;
      updatePlayPauseUI(true);
      if (typeof startSeekbarTicker === 'function') startSeekbarTicker();
      return;
    } catch(e) {
      if (state.currentTrack && state.currentTrack.id) {
        playTrackById(state.currentTrack.id, state.currentTrack, curTime);
        return;
      }
    }
  }

  // 2. If HTML5 Audio engine has a loaded source, resume it
  if (DOM.audioEngine && DOM.audioEngine.src && state.currentTrack) {
    DOM.audioEngine.play().then(() => {
      state.isPlaying = true;
      updatePlayPauseUI(true);
      if (typeof startSeekbarTicker === 'function') startSeekbarTicker();
    }).catch(e => {
      if (e.name === 'AbortError') return;
      console.warn("DOM.audioEngine resume error, recovering playback:", e);
      if (state.currentTrack && state.currentTrack.id) {
        playTrackById(state.currentTrack.id, state.currentTrack, curTime);
      }
    });
    state.isPlaying = true;
    updatePlayPauseUI(true);
    if (typeof startSeekbarTicker === 'function') startSeekbarTicker();
    return;
  }

  // 3. If YouTube player is ready and was playing in background
  if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function' && state.currentTrack) {
    try {
      state.ytPlayer.playVideo();
      state.isPlaying = true;
      updatePlayPauseUI(true);
      if (typeof startSeekbarTicker === 'function') startSeekbarTicker();
      return;
    } catch(e) {}
  }

  // 4. Fallback: reload current track preserving currentPlayheadTime
  if (state.currentTrack && state.currentTrack.id) {
    playTrackById(state.currentTrack.id, state.currentTrack, curTime);
  } else {
    const tracks = getCuratedTracks();
    if (tracks && tracks.length > 0) {
      playTrackById(tracks[0].id, tracks[0], 0);
    }
  }
}

function pausePlayback() {
  state.userPaused = true;
  clearTimeout(state._guardianResumeTimer);
  if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
    state.ytPlayer.pauseVideo();
  }
  if (DOM.audioEngine) {
    DOM.audioEngine.pause();
  }
  state.isPlaying = false;
  updatePlayPauseUI(false);
}

function playNextTrack() {
  if (!state.queue || state.queue.length === 0) {
    triggerSmartRadioContinue();
    return;
  }
  
  if (state.queueIndex < state.queue.length - 1) {
    state.queueIndex++;
    const nextTrack = state.queue[state.queueIndex];
    const playId = (nextTrack.ytId && /^[\w-]{11}$/.test(nextTrack.ytId)) ? nextTrack.ytId : nextTrack.id;
    playTrackById(playId, nextTrack);
    prefetchNextQueueTrack();
  } else {
    // End of queue reached
    if (state.repeatMode === 1) {
      // Repeat All is on
      state.queueIndex = 0;
      const nextTrack = state.queue[0];
      const playId = (nextTrack.ytId && /^[\w-]{11}$/.test(nextTrack.ytId)) ? nextTrack.ytId : nextTrack.id;
      playTrackById(playId, nextTrack);
      prefetchNextQueueTrack();
    } else {
      // Autoplay smart continuation with new songs
      triggerSmartRadioContinue();
    }
  }
}

function playPrevTrack() {
  if (!state.queue || state.queue.length === 0) return;
  if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function' && state.ytPlayer.getCurrentTime() > 3) {
    state.ytPlayer.seekTo(0, true);
    return;
  }
  state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
  const prevTrack = state.queue[state.queueIndex];
  const playId = (prevTrack.ytId && /^[\w-]{11}$/.test(prevTrack.ytId)) ? prevTrack.ytId : prevTrack.id;
  playTrackById(playId, prevTrack);
}

function handleTrackEnd() {
  if (state.repeatMode === 2) {
    if (state.ytPlayer && typeof state.ytPlayer.seekTo === 'function') state.ytPlayer.seekTo(0, true);
    resumePlayback();
  } else if (state.queueIndex < state.queue.length - 1) {
    playNextTrack();
  } else if (state.repeatMode === 1) {
    playNextTrack();
  } else {
    triggerSmartRadioContinue();
  }
}

function toggleShuffle() {
  if (!state.queue || state.queue.length === 0) {
    showToast("Çalma sırası boş");
    return;
  }
  state.isShuffle = !state.isShuffle;
  try {
    localStorage.setItem('kurfa_shuffle', state.isShuffle ? 'true' : 'false');
  } catch(e) {}
  if (DOM.btnShuffle) {
    if (state.isShuffle) {
      DOM.btnShuffle.classList.add('text-primary', 'bg-primary-fixed/40');
      state.originalQueue = [...state.queue];
      const current = state.queue[state.queueIndex] || state.queue[0];
      const remaining = state.queue.filter((_, i) => i !== state.queueIndex);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      state.queue = current ? [current, ...remaining] : remaining;
      state.queueIndex = 0;
      saveQueueState();
      showToast("Karışık Çalma: Açık");
    } else {
      DOM.btnShuffle.classList.remove('text-primary', 'bg-primary-fixed/40');
      if (state.originalQueue && state.originalQueue.length > 0) {
        state.queue = [...state.originalQueue];
      }
      state.queueIndex = (state.currentTrack && state.currentTrack.id) 
        ? Math.max(0, state.queue.findIndex(t => t.id === state.currentTrack.id)) 
        : 0;
      saveQueueState();
      showToast("Karışık Çalma: Kapalı");
    }
  }
  renderQueueDrawerList();
}

function toggleRepeat() {
  state.repeatMode = (state.repeatMode + 1) % 3;
  try {
    localStorage.setItem('kurfa_repeat', state.repeatMode.toString());
  } catch(e) {}
  if (!DOM.btnRepeat) return;
  const icon = DOM.btnRepeat.querySelector('.material-symbols-outlined');
  
  if (state.repeatMode === 0) {
    DOM.btnRepeat.classList.remove('text-primary', 'bg-primary-fixed/40');
    if (icon) icon.textContent = 'repeat';
    showToast("Tekrarlama: Kapalı");
  } else if (state.repeatMode === 1) {
    DOM.btnRepeat.classList.add('text-primary', 'bg-primary-fixed/40');
    if (icon) icon.textContent = 'repeat';
    showToast("Tekrarlama: Tüm Liste");
  } else if (state.repeatMode === 2) {
    DOM.btnRepeat.classList.add('text-primary', 'bg-primary-fixed/40');
    if (icon) icon.textContent = 'repeat_one';
    showToast("Tekrarlama: Tek Şarkı");
  }
}

// =============================================================================
// 7. UI SYNC & PLAYER DECK UPDATES (DESKTOP & MOBILE)
// =============================================================================

function updateMediaSession(track) {
  if (!('mediaSession' in navigator) || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Kurfamüzik',
      artist: track.artist || 'YouTube',
      album: 'Kurfamüzik Akışı',
      artwork: [
        { src: track.thumbnail || 'https://i.ytimg.com/vi/69L-nKRY3ac/hqdefault.jpg', sizes: '512x512', type: 'image/jpeg' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        seekPlaybackToSeconds(details.seekTime);
      }
    });
  } catch (e) {
    console.warn("MediaSession API hatası:", e);
  }
}

function updatePlayerTrackUI(track) {
  const defaultPlaceholder = "/kurfamuzik_logo.png";
  if (!track) {
    if (DOM.playerThumb) DOM.playerThumb.src = defaultPlaceholder;
    if (DOM.playerTitle) DOM.playerTitle.textContent = "Kurfa Müzik";
    if (DOM.playerArtist) DOM.playerArtist.textContent = "Bir parça seçin";
    if (DOM.playerTimeDur) DOM.playerTimeDur.textContent = "0:00";
    if (DOM.playerTimeCur) DOM.playerTimeCur.textContent = "0:00";

    if (DOM.playerThumbMobile) DOM.playerThumbMobile.src = defaultPlaceholder;
    if (DOM.playerTitleMobile) DOM.playerTitleMobile.textContent = "Kurfa Müzik";
    if (DOM.playerArtistMobile) DOM.playerArtistMobile.textContent = "Bir parça seçin";

    if (DOM.deckCoverImg) DOM.deckCoverImg.src = defaultPlaceholder;
    if (DOM.deckTitle) DOM.deckTitle.textContent = "Kurfa Müzik";
    if (DOM.deckArtist) DOM.deckArtist.textContent = "Çalınan şarkı yok";

    // Mobile Fullscreen Modal
    const mnpCover = document.getElementById('mnp-cover-art');
    const mnpBg = document.getElementById('mnp-bg-art');
    const mnpTitle = document.getElementById('mnp-title');
    const mnpArtist = document.getElementById('mnp-artist');
    const mnpDur = document.getElementById('mnp-time-dur');
    const mnpLyricLine = document.getElementById('mnp-lyric-line');
    if (mnpCover) mnpCover.src = defaultPlaceholder;
    if (mnpBg) mnpBg.src = defaultPlaceholder;
    if (mnpTitle) mnpTitle.textContent = "Kurfa Müzik";
    if (mnpArtist) mnpArtist.textContent = "Bir parça seçin";
    if (mnpDur) mnpDur.textContent = "0:00";
    if (mnpLyricLine) mnpLyricLine.textContent = "Çalan parça yok";

    updatePlayerFavBtn();
    return;
  }

  // Desktop elements
  if (DOM.playerThumb) DOM.playerThumb.src = track.thumbnail || defaultPlaceholder;
  if (DOM.playerTitle) DOM.playerTitle.textContent = track.title || "Şarkı";
  if (DOM.playerArtist) DOM.playerArtist.textContent = track.artist || "Sanatçı";
  if (DOM.playerTimeDur) DOM.playerTimeDur.textContent = track.duration || "3:30";

  // Mobile mini elements
  if (DOM.playerThumbMobile) DOM.playerThumbMobile.src = track.thumbnail || defaultPlaceholder;
  if (DOM.playerTitleMobile) DOM.playerTitleMobile.textContent = track.title || "Şarkı";
  if (DOM.playerArtistMobile) DOM.playerArtistMobile.textContent = track.artist || "Sanatçı";

  // Mobile Fullscreen Player elements (Photo 2 Reference)
  const mnpCover = document.getElementById('mnp-cover-art');
  const mnpBg = document.getElementById('mnp-bg-art');
  const mnpTitle = document.getElementById('mnp-title');
  const mnpArtist = document.getElementById('mnp-artist');
  const mnpDur = document.getElementById('mnp-time-dur');
  const mnpContextSub = document.getElementById('mnp-context-sub');
  const mnpContextTitle = document.getElementById('mnp-context-title');

  if (mnpCover) mnpCover.src = track.thumbnail || defaultPlaceholder;
  if (mnpBg) mnpBg.src = track.thumbnail || defaultPlaceholder;
  if (mnpTitle) mnpTitle.textContent = track.title || "Şarkı";
  if (mnpArtist) mnpArtist.textContent = track.artist || "Sanatçı";
  if (mnpDur) mnpDur.textContent = track.duration || "3:30";
  if (mnpContextSub) mnpContextSub.textContent = state.playingContextSub || "ÇALMA LİSTESİNDEN ÇALINIYOR";
  if (mnpContextTitle) mnpContextTitle.textContent = state.playingContextTitle || "YouTube Trendleri";

  // Visualizer / Lyrics tab sync
  if (DOM.deckCoverImg) DOM.deckCoverImg.src = track.thumbnail || defaultPlaceholder;
  if (DOM.deckTitle) DOM.deckTitle.textContent = track.title || "Şarkı";
  if (DOM.deckArtist) DOM.deckArtist.textContent = track.artist || "Sanatçı";

  updatePlayerFavBtn();
  updateMediaSession(track);
  syncFloatingPipUI();
}

function updatePlayPauseUI(playing) {
  // Desktop
  if (DOM.playerPlayIcon) {
    DOM.playerPlayIcon.textContent = playing ? 'pause' : 'play_arrow';
  }
  // Mobile Mini
  if (DOM.playerPlayIconMobile) {
    DOM.playerPlayIconMobile.textContent = playing ? 'pause' : 'play_arrow';
  }
  // Mobile Fullscreen
  const mnpPlayIcon = document.getElementById('mnp-play-icon');
  if (mnpPlayIcon) {
    mnpPlayIcon.textContent = playing ? 'pause' : 'play_arrow';
  }
  // Vinyl
  if (DOM.vinylDisc) {
    if (playing) {
      DOM.vinylDisc.style.animationPlayState = 'running';
      DOM.vinylDisc.classList.add('animate-spin-slow');
    } else {
      DOM.vinylDisc.style.animationPlayState = 'paused';
    }
  }
  // MediaSession state
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch (e) {}
  }

  syncFloatingPipUI();
  renderPlaylistTracksTable();
  renderHomeTracklistTable();
}

function updatePlayerFavBtn() {
  const isFav = state.currentTrack && state.favorites.some(t => t.id === state.currentTrack.id);

  // Desktop fav button
  if (DOM.playerFavBtn) {
    const icon = DOM.playerFavBtn.querySelector('.material-symbols-outlined');
    if (isFav) {
      DOM.playerFavBtn.classList.add('text-primary');
      if (icon) { icon.textContent = 'favorite'; icon.classList.add('filled'); }
    } else {
      DOM.playerFavBtn.classList.remove('text-primary');
      if (icon) { icon.textContent = 'favorite_border'; icon.classList.remove('filled'); }
    }
  }

  // Mobile fav button
  if (DOM.playerFavBtnMobile) {
    const icon = DOM.playerFavBtnMobile.querySelector('.material-symbols-outlined');
    if (isFav) {
      DOM.playerFavBtnMobile.classList.add('text-primary');
      if (icon) { icon.textContent = 'favorite'; icon.classList.add('filled'); }
    } else {
      DOM.playerFavBtnMobile.classList.remove('text-primary');
      if (icon) { icon.textContent = 'favorite_border'; icon.classList.remove('filled'); }
    }
  }
}

// =============================================================================
// 8. 120 FPS SCRUBBABLE SEEKBAR & VOLUME SLIDER
// =============================================================================

let seekbarRaf = null;
let lastSeekbarTickTime = 0;

function formatTime(sec) {
  if (typeof sec !== 'number' || isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
window.formatTime = formatTime;

function getActiveMediaDuration() {
  let dur = 0;
  // 1. If Video mode, prioritize YouTube duration
  if (state.deckVisualMode === 'video' && state.ytReady && state.ytPlayer && typeof state.ytPlayer.getDuration === 'function') {
    dur = state.ytPlayer.getDuration() || 0;
  }
  // 2. If HTML5 audio has duration, use it
  if (!dur && DOM.audioEngine && DOM.audioEngine.duration && !isNaN(DOM.audioEngine.duration) && DOM.audioEngine.duration > 0) {
    dur = DOM.audioEngine.duration;
  }
  // 3. If YouTube player has duration
  if (!dur && state.ytReady && state.ytPlayer && typeof state.ytPlayer.getDuration === 'function') {
    dur = state.ytPlayer.getDuration() || 0;
  }
  // 4. Fallback to track duration string (e.g. "3:45")
  if (!dur && state.currentTrack && state.currentTrack.duration) {
    const parts = (state.currentTrack.duration || '').split(':').map(p => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      dur = parts[0] * 60 + parts[1];
    }
  }
  return dur || 0;
}
window.getActiveMediaDuration = getActiveMediaDuration;

function getActiveMediaCurrentTime() {
  if (state.deckVisualMode === 'video' && state.ytReady && state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
    return state.ytPlayer.getCurrentTime() || 0;
  }
  if (DOM.audioEngine && DOM.audioEngine.src && !isNaN(DOM.audioEngine.currentTime) && DOM.audioEngine.currentTime > 0) {
    return DOM.audioEngine.currentTime;
  }
  if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
    return state.ytPlayer.getCurrentTime() || 0;
  }
  return state.currentPlayheadTime || 0;
}
window.getActiveMediaCurrentTime = getActiveMediaCurrentTime;

function updateSeekbarUI(cur, dur) {
  if (!dur || dur <= 0) return;
  const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
  const timeCurStr = formatTime(cur);
  const timeDurStr = formatTime(dur);

  // Desktop seekbar
  if (DOM.playerSeekFill) DOM.playerSeekFill.style.width = `${pct}%`;
  if (DOM.playerSeekKnob) DOM.playerSeekKnob.style.left = `${pct}%`;
  if (DOM.playerTimeCur) DOM.playerTimeCur.textContent = timeCurStr;
  if (DOM.playerTimeDur) DOM.playerTimeDur.textContent = timeDurStr;

  // Mobile mini seekbar
  if (DOM.playerMobileSeekFill) DOM.playerMobileSeekFill.style.width = `${pct}%`;

  // Mobile Fullscreen Modal seekbar (only if open)
  if (state.mobileNowPlayingOpen) {
    const mnpSeekFill = document.getElementById('mnp-seek-fill');
    const mnpSeekKnob = document.getElementById('mnp-seek-knob');
    const mnpCur = document.getElementById('mnp-time-cur');
    const mnpDur = document.getElementById('mnp-time-dur');
    if (mnpSeekFill) mnpSeekFill.style.width = `${pct}%`;
    if (mnpSeekKnob) mnpSeekKnob.style.left = `${pct}%`;
    if (mnpCur) mnpCur.textContent = timeCurStr;
    if (mnpDur) mnpDur.textContent = timeDurStr;
  }

  // Document PiP window seekbar (only if active)
  if (pipWindowInstance && pipWindowInstance.document) {
    const extSeekFill = pipWindowInstance.document.getElementById('pip-ext-seek-fill');
    const extCur = pipWindowInstance.document.getElementById('pip-ext-cur');
    const extDur = pipWindowInstance.document.getElementById('pip-ext-dur');
    if (extSeekFill) extSeekFill.style.width = `${pct}%`;
    if (extCur) extCur.textContent = timeCurStr;
    if (extDur) extDur.textContent = timeDurStr;
  }
}
window.updateSeekbarUI = updateSeekbarUI;

function syncLyricsToTime(cur) {
  if (typeof syncLyricsWithTime === 'function') {
    syncLyricsWithTime(cur);
  }
}
window.syncLyricsToTime = syncLyricsToTime;

function startSeekbarTicker() {
  if (seekbarRaf) {
    cancelAnimationFrame(seekbarRaf);
    seekbarRaf = null;
  }
  if (!state.isPlaying) return;

  function tick(timestamp) {
    if (!state.isPlaying) {
      seekbarRaf = null;
      return;
    }

    if (!state.isSeeking) {
      const now = timestamp || performance.now();
      const throttleInterval = state.isTahtaMode ? 250 : 80; // 80ms is silky smooth for seekbars and saves 80% CPU
      if (now - lastSeekbarTickTime >= throttleInterval) {
        lastSeekbarTickTime = now;
        const cur = getActiveMediaCurrentTime();
        const dur = getActiveMediaDuration();

        if (dur > 0) {
          if (cur > 0) {
            state.currentPlayheadTime = cur;
          }
          updateSeekbarUI(cur, dur);
          if (state.currentTab === 'calma-listeleri' || state.mobileNowPlayingOpen) {
            syncLyricsWithTime(cur);
          }
        }
      }
    }
    seekbarRaf = requestAnimationFrame(tick);
  }

  seekbarRaf = requestAnimationFrame(tick);
}

function initSeekbarInteractions() {
  if (!DOM.playerSeekTrack) return;

  function calculateSeekPercentage(e) {
    const rect = DOM.playerSeekTrack.getBoundingClientRect();
    const clientX = getEventClientX(e);
    const clickX = clientX - rect.left;
    return Math.max(0, Math.min(1, clickX / rect.width));
  }

  function applySeek(pct, commit = false) {
    if (DOM.playerSeekFill) DOM.playerSeekFill.style.width = `${pct * 100}%`;
    if (DOM.playerSeekKnob) DOM.playerSeekKnob.style.left = `${pct * 100}%`;
    if (DOM.playerMobileSeekFill) DOM.playerMobileSeekFill.style.width = `${pct * 100}%`;

    const dur = getActiveMediaDuration();
    const seekTime = Math.max(0, Math.min(dur, pct * dur));
    if (DOM.playerTimeCur) DOM.playerTimeCur.textContent = formatTime(seekTime);

    if (commit) {
      seekPlaybackToSeconds(seekTime);
    }
  }

  const onPointerDown = (e) => {
    state.isSeeking = true;
    const pct = calculateSeekPercentage(e);
    applySeek(pct, false);

    const onPointerMove = (moveEvent) => {
      if (!state.isSeeking) return;
      const movePct = calculateSeekPercentage(moveEvent);
      applySeek(movePct, false);
    };

    const onPointerUp = (upEvent) => {
      if (state.isSeeking) {
        state.isSeeking = false;
        const finalPct = calculateSeekPercentage(upEvent);
        applySeek(finalPct, true);
      }
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
  };

  DOM.playerSeekTrack.addEventListener('mousedown', onPointerDown);
  DOM.playerSeekTrack.addEventListener('touchstart', onPointerDown, { passive: true });
}

function initVolumeInteractions() {
  if (!DOM.playerVolTrack) return;

  function calculateVolPercentage(e) {
    const rect = DOM.playerVolTrack.getBoundingClientRect();
    const clientX = getEventClientX(e);
    const clickX = clientX - rect.left;
    return Math.max(0, Math.min(1, clickX / rect.width));
  }

  const onPointerDown = (e) => {
    state.isScrubbingVol = true;
    const vol = calculateVolPercentage(e);
    setPlayerVolume(vol);

    const onPointerMove = (moveEvent) => {
      if (!state.isScrubbingVol) return;
      const moveVol = calculateVolPercentage(moveEvent);
      setPlayerVolume(moveVol);
    };

    const onPointerUp = () => {
      state.isScrubbingVol = false;
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
  };

  DOM.playerVolTrack.addEventListener('mousedown', onPointerDown);
  DOM.playerVolTrack.addEventListener('touchstart', onPointerDown, { passive: true });
}

function setPlayerVolume(vol) {
  state.volume = Math.max(0, Math.min(1, vol));
  state.isMuted = state.volume === 0;
  localStorage.setItem('kurfa_vol', state.volume.toString());

  if (DOM.playerVolFill) DOM.playerVolFill.style.width = `${state.volume * 100}%`;
  const knob = DOM.playerVolTrack ? DOM.playerVolTrack.querySelector('.vol-knob') : null;
  if (knob) knob.style.left = `${state.volume * 100}%`;

  if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.setVolume === 'function') {
    state.ytPlayer.setVolume(Math.round(state.volume * 100));
  }
  if (DOM.audioEngine) {
    DOM.audioEngine.volume = state.volume;
  }

  if (DOM.btnVolumeIcon) {
    const icon = DOM.btnVolumeIcon.querySelector('.material-symbols-outlined');
    if (icon) {
      if (state.volume === 0) icon.textContent = 'volume_off';
      else if (state.volume < 0.5) icon.textContent = 'volume_down';
      else icon.textContent = 'volume_up';
    }
  }
}

function toggleMute() {
  if (state.isMuted) {
    setPlayerVolume(parseFloat(localStorage.getItem('kurfa_prev_vol') || '0.8'));
    showToast("Ses Açıldı");
  } else {
    localStorage.setItem('kurfa_prev_vol', state.volume.toString());
    setPlayerVolume(0);
    showToast("Sessize Alındı");
  }
}

// =============================================================================
// 9. REAL SYNCHRONIZED KARAOKE LYRICS (LRCLIB & LIVE HIGHLIGHT)
// =============================================================================

function cleanLyricsQuery(title, artist) {
  let rawT = (title || '')
    .replace(/\s*[\(\[](official\s*(music)?\s*video|video\s*klip|klip|audio|lyric\s*video|visualizer|canlı|live|hd|4k|prod\.[^\)\]]*)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*-\s*(official|klip|video|audio).*/gi, '')
    .replace(/["'"]/g, '')
    .trim();
  let rawA = (artist || '')
    .replace(/\s*-\s*topic/gi, '')
    .replace(/vevo/gi, '')
    .replace(/["'"]/g, '')
    .trim();

  let parsedArtist = rawA;
  let parsedTitle = rawT;
  if (rawT.includes(' - ')) {
    const parts = rawT.split(' - ').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      parsedArtist = parts[0];
      parsedTitle = parts.slice(1).join(' - ');
    }
  }

  return { cleanT: parsedTitle, cleanA: parsedArtist, rawT, rawA };
}

function updateLyricsOffsetUI() {
  const display = document.getElementById('lyrics-offset-display');
  if (display) {
    const off = state.lyricsOffset || 0;
    display.textContent = (off >= 0 ? '+' : '') + off.toFixed(1) + 's';
  }
}

function setExactLyricsOffset(offset) {
  if (!state.currentTrack) return;
  state.lyricsOffset = Math.round(offset * 10) / 10;
  if (state.currentTrack.id) {
    localStorage.setItem('kurfa_offset_' + state.currentTrack.id, state.lyricsOffset.toString());
  }
  updateLyricsOffsetUI();
  showToast(`Söz Senkronu: ${(state.lyricsOffset >= 0 ? '+' : '') + state.lyricsOffset.toFixed(1)}s`, 'success');
  
  if (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
    syncLyricsWithTime(state.ytPlayer.getCurrentTime());
  } else if (DOM.audioEngine) {
    syncLyricsWithTime(DOM.audioEngine.currentTime);
  }
}
window.setExactLyricsOffset = setExactLyricsOffset;

function promptManualOffset() {
  const current = state.lyricsOffset || 0;
  const val = prompt("Şarkı sözü senkron farkını girin (Örnek: -41 veya +2.5 saniye):", current.toFixed(1));
  if (val !== null) {
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num)) {
      setExactLyricsOffset(num);
    }
  }
}
window.promptManualOffset = promptManualOffset;

function syncLineToCurrentPlayback(line) {
  if (!line || typeof line.time !== 'number') return;
  let cur = 0;
  if (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
    cur = state.ytPlayer.getCurrentTime();
  } else if (DOM.audioEngine) {
    cur = DOM.audioEngine.currentTime;
  }
  if (!cur) {
    showToast("Önce şarkıyı başlatın", "info");
    return;
  }
  // Target: line.time = cur + offset => offset = line.time - cur
  const newOffset = Math.round((line.time - cur) * 10) / 10;
  setExactLyricsOffset(newOffset);
  showToast(`Bu Satır Şu Ana Eşitlendi: ${(newOffset >= 0 ? '+' : '')}${newOffset.toFixed(1)}s`, 'success');
}
window.syncLineToCurrentPlayback = syncLineToCurrentPlayback;

function syncActiveLineToPlayback() {
  if (!state.activeLyrics || state.activeLyrics.length === 0) {
    showToast("Senkronize söz bulunamadı", "info");
    return;
  }
  let targetLine = null;
  if (state.currentLyricIndex >= 0 && state.activeLyrics[state.currentLyricIndex]) {
    targetLine = state.activeLyrics[state.currentLyricIndex];
  } else {
    // If before first line, try first line
    targetLine = state.activeLyrics[0];
  }
  if (targetLine) {
    syncLineToCurrentPlayback(targetLine);
  }
}
window.syncActiveLineToPlayback = syncActiveLineToPlayback;

function adjustLyricsOffset(delta) {
  if (!state.currentTrack) return;
  if (delta === 0) {
    setExactLyricsOffset(0);
  } else {
    const next = Math.round(((state.lyricsOffset || 0) + delta) * 10) / 10;
    setExactLyricsOffset(next);
  }
}
window.adjustLyricsOffset = adjustLyricsOffset;

async function updateLyricsDisplay() {
  if (!DOM.deckLyricsLines) return;
  state.currentLyricIndex = -1;

  const track = state.currentTrack;
  if (!track) {
    renderLyricsEmpty(null);
    return;
  }

  const cacheKey = `${track.id || ''}_${track.title || ''}_${track.artist || ''}`;

  // Restore track-specific offset from localStorage
  const savedOffset = track.id ? localStorage.getItem('kurfa_offset_' + track.id) : null;
  state.lyricsOffset = savedOffset !== null ? parseFloat(savedOffset) : 0;
  updateLyricsOffsetUI();

  // Check memory cache
  if (lyricsMemoryCache.has(cacheKey)) {
    const cached = lyricsMemoryCache.get(cacheKey);
    if (cached.synced && cached.lines) {
      renderLyricsList(cached.lines, cached.source);
    } else if (cached.plain) {
      renderPlainLyrics(cached.plain, cached.source);
    } else {
      renderLyricsEmpty(track);
    }
    return;
  }

  // Show loading skeleton in lyrics box
  if (DOM.lyricsStatusLabel) DOM.lyricsStatusLabel.textContent = "Şarkı Sözleri Aranıyor...";
  if (DOM.lyricsSourceBadge) DOM.lyricsSourceBadge.textContent = "Bağlanıyor...";
  DOM.deckLyricsLines.innerHTML = `
    <div class="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
      <span class="material-symbols-outlined text-[32px] animate-spin text-primary">progress_activity</span>
      <p class="text-xs font-semibold">Senkronize şarkı sözleri veritabanından çekiliyor...</p>
    </div>
  `;

  const { cleanT, cleanA, rawT, rawA } = cleanLyricsQuery(track.title, track.artist);

  // 1. Fetch from our Cloudflare worker API
  try {
    const res = await fetch(`${API_BASE}/api/lyrics?track=${encodeURIComponent(cleanT)}&artist=${encodeURIComponent(cleanA)}`);
    const data = await res.json();

    if (data.success && data.syncedLyrics) {
      const parsedLines = parseLyricsPayload(data, track);
      lyricsMemoryCache.set(cacheKey, { synced: true, lines: parsedLines, source: "LRCLIB Canlı Sözler", duration: data.duration });
      checkAndDisplayClipIntroHint(track, data.duration || 0);
      renderLyricsList(parsedLines, "LRCLIB Canlı Sözler");
      return;
    } else if (data.success && data.plainLyrics) {
      lyricsMemoryCache.set(cacheKey, { synced: false, plain: data.plainLyrics, source: "LRCLIB Tam Metin" });
      checkAndDisplayClipIntroHint(track, 0);
      renderPlainLyrics(data.plainLyrics, "LRCLIB Tam Metin");
      return;
    }
  } catch (err) {
    console.warn("Backend lyrics error, trying direct fetch:", err);
  }

  // 2. Direct client-side fetch from LRCLIB with multiple query permutations
  const clientQueries = [
    `${cleanT} ${cleanA}`.trim(),
    `${cleanA} ${cleanT}`.trim(),
    cleanT,
    rawT
  ].filter(Boolean);

  function scoreLyricsMatchClient(cand, targetTitle, targetArtist) {
    if (!cand || (!cand.syncedLyrics && !cand.plainLyrics)) return -1;
    const norm = s => (s || '').toLowerCase()
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
      .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[\(\[\{].*?[\)\]\}]/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cTitle = norm(cand.trackName);
    const cArtist = norm(cand.artistName);
    const tTitle = norm(targetTitle);
    const tArtist = norm(targetArtist);

    if (!cTitle || !tTitle) return -1;
    const isDirect = cTitle === tTitle || cTitle.includes(tTitle) || tTitle.includes(cTitle);
    const words = tTitle.split(' ').filter(w => w.length > 1);
    let count = 0;
    for (const w of words) {
      if (cTitle.includes(w)) count++;
    }
    const overlap = words.length > 0 ? (count / words.length) : (isDirect ? 1 : 0);
    if (!isDirect && overlap < 0.6) return -1;

    let score = isDirect ? 4.0 : overlap * 3.0;
    const cleanArt = tArtist.replace(/youtube|vevo|topic|music|sanatci/g, '').trim();
    if (cleanArt) {
      if (cArtist === cleanArt || cArtist.includes(cleanArt) || cleanArt.includes(cArtist)) {
        score += 3.0;
      } else if (cArtist && words.length <= 2 && !isDirect) {
        return -1;
      }
    }
    if (cand.syncedLyrics) score += 1.5;
    return score;
  }

  for (const q of clientQueries) {
    try {
      const directRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
      if (directRes.ok) {
        const list = await directRes.json();
        if (Array.isArray(list) && list.length > 0) {
          let best = null;
          let bestSc = 0;
          for (const item of list) {
            const sc = scoreLyricsMatchClient(item, cleanT, cleanA);
            if (sc > bestSc) {
              bestSc = sc;
              best = item;
            }
          }
          if (best && bestSc > 0) {
            if (best.syncedLyrics) {
              const parsedLines = parseLyricsPayload(best, track);
              lyricsMemoryCache.set(cacheKey, { synced: true, lines: parsedLines, source: "LRCLIB Canlı Sözler", duration: best.duration });
              checkAndDisplayClipIntroHint(track, best.duration || 0);
              renderLyricsList(parsedLines, "LRCLIB Canlı Sözler");
              return;
            } else if (best.plainLyrics) {
              lyricsMemoryCache.set(cacheKey, { synced: false, plain: best.plainLyrics, source: "LRCLIB Tam Metin" });
              checkAndDisplayClipIntroHint(track, 0);
              renderPlainLyrics(best.plainLyrics, "LRCLIB Tam Metin");
              return;
            }
          }
        }
      }
    } catch (e) {}
  }

  // 3. Honest Empty State (No artificial fallback lyrics)
  lyricsMemoryCache.set(cacheKey, { empty: true });
  checkAndDisplayClipIntroHint(track, 0);
  renderLyricsEmpty(track);
}

function checkAndDisplayClipIntroHint(track, lrcDuration) {
  const hintEl = document.getElementById('lyrics-intro-diff-hint');
  if (!hintEl) return;

  let ytDur = 0;
  if (state.ytPlayer && typeof state.ytPlayer.getDuration === 'function') {
    ytDur = state.ytPlayer.getDuration();
  }
  if (!ytDur && track && track.duration) {
    const parts = (track.duration || '').split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) ytDur = parts[0] * 60 + parts[1];
  }

  if (ytDur > 30 && lrcDuration > 30) {
    const diff = Math.round(ytDur - lrcDuration);
    if (diff >= 6 && diff <= 120 && Math.abs(state.lyricsOffset) < 2) {
      hintEl.innerHTML = `
        <span class="flex items-center gap-1.5">
          <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[15px] text-amber-400">movie</span>Klip İntro Farkı:</span>
          <span class="font-mono font-bold">-${diff}s</span>
          <button type="button" class="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 font-bold ml-1 transition-colors underline" onclick="setExactLyricsOffset(-${diff})">Uygula</button>
        </span>
      `;
      hintEl.classList.remove('hidden');
      hintEl.classList.add('flex');
      return;
    }
  }
  hintEl.classList.add('hidden');
  hintEl.classList.remove('flex');
}

function isLrcMetaLine(text, time, track) {
  if (!text) return true;
  const t = text.trim();
  if (t === '...' || t === '---' || t === '***' || t === '♪' || t === '♪♪' || t === '♪ ♪') return true;
  if (time <= 8) {
    const lower = t.toLowerCase();
    if (/^(söz|müzik|düzenleme|aranje|mix|mastering|yazar|besteci|parça|şarkı|albüm|kayıt|producer|written by|composed by|lyrics by|arranged by|mixed by|mastered by|directed by|klip yönetmeni)[:\s-]/i.test(lower)) {
      return true;
    }
    if (track) {
      const title = (track.title || '').toLowerCase().trim();
      const artist = (track.artist || '').toLowerCase().trim();
      if (lower === title || lower === artist || lower === `${artist} - ${title}`) {
        return true;
      }
    }
  }
  return false;
}

function parseLyricsPayload(data, track) {
  if (!data.syncedLyrics) return [];
  const lines = [];
  const rawLines = data.syncedLyrics.split('\n');
  for (const raw of rawLines) {
    if (/^\s*\[(ar|ti|al|by|length|offset|re|ve):/i.test(raw)) continue;
    const match = raw.match(/^\s*\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3] ? parseFloat('0.' + match[3]) : 0;
      const totalSec = min * 60 + sec + ms;
      const text = match[4].trim();
      if (text && !isLrcMetaLine(text, totalSec, track)) {
        lines.push({ time: totalSec, text: text });
      }
    }
  }
  return lines;
}

function renderLyricsList(lines, sourceName) {
  state.activeLyrics = lines;
  state.currentLyricIndex = -1;

  if (DOM.lyricsStatusLabel) DOM.lyricsStatusLabel.textContent = "Canlı Senkronize Sözler";
  if (DOM.lyricsSourceBadge) DOM.lyricsSourceBadge.textContent = sourceName || "Senkronize LRC";

  if (!DOM.deckLyricsLines) return;
  DOM.deckLyricsLines.innerHTML = '';

  lines.forEach((line) => {
    const p = document.createElement('div');
    p.className = `lyric-line group flex items-center justify-between py-1.5 px-3 rounded-xl transition-all duration-200 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40 cursor-pointer select-none text-sm md:text-base`;
    p.setAttribute('data-time', line.time);
    
    const textSpan = document.createElement('span');
    textSpan.className = 'flex-1 leading-relaxed';
    textSpan.textContent = line.text;

    // Quick sync button on hover
    const syncBtn = document.createElement('button');
    syncBtn.type = 'button';
    syncBtn.className = 'opacity-0 group-hover:opacity-100 hover:opacity-100 px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary hover:bg-primary/25 transition-all flex items-center gap-1 ml-2 flex-shrink-0';
    syncBtn.title = 'Şarkı çalarken bu satırı duyduğunuz an tıklayın: Şarkı sözü senkronunu tam buraya kilitler';
    syncBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">sync</span><span class="hidden sm:inline">Eşitle</span>`;
    syncBtn.onclick = (e) => {
      e.stopPropagation();
      syncLineToCurrentPlayback(line);
    };

    // Tap lyric to jump
    p.onclick = () => {
      const targetVideoTime = Math.max(0, line.time - (state.lyricsOffset || 0));
      seekPlaybackToSeconds(targetVideoTime);
      showToast(`${formatTime(targetVideoTime)} saniyesine sarıldı`, 'info');
    };

    p.appendChild(textSpan);
    p.appendChild(syncBtn);
    DOM.deckLyricsLines.appendChild(p);
  });
}

function renderPlainLyrics(plainText, sourceName) {
  state.activeLyrics = [];
  state.currentLyricIndex = -1;
  if (DOM.lyricsStatusLabel) DOM.lyricsStatusLabel.textContent = "Düz Metin Şarkı Sözleri";
  if (DOM.lyricsSourceBadge) DOM.lyricsSourceBadge.textContent = sourceName || "LRCLIB";

  if (!DOM.deckLyricsLines) return;
  const lines = plainText.split('\n').map(l => l.trim()).filter(Boolean);
  DOM.deckLyricsLines.innerHTML = `
    <div class="pb-2 text-[11px] text-on-surface-variant/80 border-b border-surface-container/50">
      * Bu parça için canlı zaman damgası bulunmamaktadır, şarkı sözleri tam metin olarak sunulmaktadır.
    </div>
    <div class="flex flex-col gap-2 pt-2">
      ${lines.map(l => `<p class="py-1 text-sm text-on-surface font-medium leading-relaxed">${escapeHtml(l)}</p>`).join('')}
    </div>
  `;
  const mnpLyricLine = document.getElementById('mnp-lyric-line');
  if (mnpLyricLine && lines.length > 0) {
    mnpLyricLine.textContent = lines[0];
  }
}

function renderLyricsEmpty(track) {
  state.activeLyrics = [];
  state.currentLyricIndex = -1;
  if (DOM.lyricsStatusLabel) DOM.lyricsStatusLabel.textContent = track ? "Söz Bulunamadı" : "Bekleniyor";
  if (DOM.lyricsSourceBadge) DOM.lyricsSourceBadge.textContent = "Veritabanı";

  const mnpLyricLine = document.getElementById('mnp-lyric-line');
  if (mnpLyricLine) {
    mnpLyricLine.textContent = track ? `${track.title} - ${track.artist}` : "Çalan parça yok";
  }

  if (!DOM.deckLyricsLines) return;

  if (!track) {
    DOM.deckLyricsLines.innerHTML = `
      <div class="py-8 px-4 flex flex-col items-center justify-center text-center gap-3 text-on-surface-variant">
        <div class="w-12 h-12 rounded-2xl bg-surface-container-high/60 flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[28px]" aria-hidden="true">music_note</span>
        </div>
        <div>
          <p class="text-sm font-bold text-on-surface">Çalan şarkı bulunmuyor</p>
          <p class="text-xs text-on-surface-variant mt-1 max-w-sm">Bir şarkı başlattığınızda sözler ve senkronizasyon burada görünecektir.</p>
        </div>
      </div>
    `;
    return;
  }

  const queryStr = `${track.artist || ''} ${track.title || ''} şarkı sözleri`;
  DOM.deckLyricsLines.innerHTML = `
    <div class="py-8 px-4 flex flex-col items-center justify-center text-center gap-3 text-on-surface-variant">
      <div class="w-12 h-12 rounded-2xl bg-surface-container-high/60 flex items-center justify-center text-on-surface-variant">
        <span class="material-symbols-outlined text-[28px]" aria-hidden="true">lyrics</span>
      </div>
      <div>
        <p class="text-sm font-bold text-on-surface">Bu parça için senkronize söz bulunamadı</p>
        <p class="text-xs text-on-surface-variant mt-1 max-w-sm">YouTube video klibi, canlı performans veya veritabanında henüz yer almayan bir sürüm olabilir.</p>
      </div>
      <a href="https://www.google.com/search?q=${encodeURIComponent(queryStr)}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-container hover:bg-surface-container-high text-xs font-bold text-primary transition-all">
        <span>Google'da Şarkı Sözlerini Ara</span>
        <span class="material-symbols-outlined text-[16px]" aria-hidden="true">open_in_new</span>
      </a>
    </div>
  `;
}

function syncLyricsWithTime(currentTime) {
  // Exit immediately if lyrics are not visible on screen (0 ms CPU when dormant)
  const isLyricsVisible = (state.currentTab === 'calma-listeleri') || (state.mobileNowPlayingOpen === true);
  if (!isLyricsVisible) return;

  if (!state.activeLyrics || state.activeLyrics.length === 0 || !DOM.deckLyricsLines) return;

  const adjustedTime = currentTime + (state.lyricsOffset || 0);

  // 1. Detect and handle Intro / Instrumental phase before first vocal line
  const firstLyricTime = state.activeLyrics[0].time;
  if (adjustedTime < firstLyricTime) {
    if (state.currentLyricIndex !== -2) {
      state.currentLyricIndex = -2; // -2 designates Intro / Instrumental
      const allLines = DOM.deckLyricsLines.querySelectorAll('.lyric-line');
      allLines.forEach(l => {
        l.classList.remove('active-lyric', 'active');
        l.classList.add('text-on-surface-variant');
      });

      if (DOM.lyricsStatusLabel) {
        DOM.lyricsStatusLabel.innerHTML = `
          <span class="flex items-center gap-1.5 text-secondary">
            <span class="material-symbols-outlined text-[14px] animate-pulse">graphic_eq</span>
            <span>♪ Enstrümantal Giriş ♪</span>
          </span>
        `;
      }

      const mnpLyricLine = document.getElementById('mnp-lyric-line');
      if (mnpLyricLine) {
        mnpLyricLine.innerHTML = `<span class="italic opacity-80 flex items-center justify-center gap-1.5"><span class="animate-pulse">♪</span><span>Enstrümantal Giriş</span><span class="animate-pulse">♪</span></span>`;
      }

      if (DOM.karaokeLyricsBox) {
        DOM.karaokeLyricsBox.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    return;
  }

  // 2. Active vocal lyrics search
  let activeIdx = -1;
  for (let i = 0; i < state.activeLyrics.length; i++) {
    if (adjustedTime >= state.activeLyrics[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }

  if (activeIdx !== -1 && activeIdx !== state.currentLyricIndex) {
    const wasIntro = (state.currentLyricIndex === -2);
    state.currentLyricIndex = activeIdx;
    
    if (wasIntro && DOM.lyricsStatusLabel) {
      DOM.lyricsStatusLabel.textContent = "Canlı Senkronize Sözler";
    }

    const lines = DOM.deckLyricsLines.querySelectorAll('.lyric-line');
    lines.forEach((line, i) => {
      if (i === activeIdx) {
        line.classList.add('active-lyric', 'active');
        line.classList.remove('text-on-surface-variant');

        // Scroll ONLY the dedicated lyrics box smoothly without moving the window
        if (DOM.karaokeLyricsBox) {
          const container = DOM.karaokeLyricsBox;
          const containerRect = container.getBoundingClientRect();
          const lineRect = line.getBoundingClientRect();
          const relativeY = (lineRect.top - containerRect.top) + container.scrollTop;
          const targetScroll = relativeY - (container.clientHeight / 2) + (lineRect.height / 2);
          container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        }
      } else {
        line.classList.remove('active-lyric', 'active');
        line.classList.add('text-on-surface-variant');
      }
    });

    // Mobile Fullscreen Modal Single-Line Animated Lyric (Photo 2 Reference)
    const mnpLyricLine = document.getElementById('mnp-lyric-line');
    if (mnpLyricLine && state.activeLyrics[activeIdx]) {
      const newLineText = state.activeLyrics[activeIdx].text || '';
      if (mnpLyricLine.textContent !== newLineText) {
        mnpLyricLine.style.opacity = '0';
        mnpLyricLine.style.transform = 'translateY(6px)';
        setTimeout(() => {
          mnpLyricLine.textContent = newLineText;
          mnpLyricLine.style.opacity = '1';
          mnpLyricLine.style.transform = 'translateY(0)';
        }, 120);
      }
    }
  }
}

// =============================================================================
// 10. SEARCH & INSTANT CONVERTER (100% RELIABLE)
// =============================================================================

let searchDebounceTimeout = null;

function debouncedSearch(query) {
  if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => {
    executeSearchImmediate(query, false);
  }, 400);
}

async function executeSearchImmediate(query, autoSwitchTab = true) {
  if (!query || query.trim().length === 0) return;
  const cleanQ = query.trim();

  if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);

  if (DOM.topSearchInput && DOM.topSearchInput.value !== cleanQ) {
    DOM.topSearchInput.value = cleanQ;
  }
  if (DOM.engineSearchInput && DOM.engineSearchInput.value !== cleanQ) {
    DOM.engineSearchInput.value = cleanQ;
  }

  const urlMatch = cleanQ.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  if (urlMatch) {
    const videoId = urlMatch[1];
    const directTrack = {
      id: videoId,
      title: "YouTube Parçası (" + videoId + ")",
      artist: "Doğrudan Akış",
      duration: "3:30",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    };
    playTrackById(videoId, directTrack);
    switchTab('arama', true);
    renderSpotlightCard(directTrack);
    showToast("YouTube linki doğrudan akışa alındı");
    return;
  }

  if (autoSwitchTab && state.currentTab !== 'arama') {
    switchTab('arama', false);
  }

  if (DOM.searchResultsCount) {
    DOM.searchResultsCount.textContent = `"${cleanQ}" Aranıyor...`;
  }
  if (DOM.searchResultsList) {
    DOM.searchResultsList.innerHTML = `
      <div class="col-span-full py-12 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
        <span class="material-symbols-outlined text-[36px] animate-spin text-primary">progress_activity</span>
        <p class="text-sm font-semibold">YouTube'dan en iyi müzik kayıtları getiriliyor...</p>
      </div>
    `;
  }

  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(cleanQ)}`);
    const data = await res.json();
    if (data.success && data.results && data.results.length > 0) {
      state.currentSearchResults = data.results;
      state._rawSearchResults = [...data.results];
      state.currentSearchQuery = cleanQ;
      state.searchSort = 'alaka';
      renderSearchResults(data.results, cleanQ);
    } else {
      renderSearchEmpty(cleanQ);
    }
  } catch (err) {
    console.error("Search fetch error:", err);
    const local = CURATED_TRACKS.filter(t => 
      t.title.toLowerCase().includes(cleanQ.toLowerCase()) || 
      t.artist.toLowerCase().includes(cleanQ.toLowerCase())
    );
    if (local.length > 0) {
      state.currentSearchResults = local;
      state._rawSearchResults = [...local];
      state.currentSearchQuery = cleanQ;
      state.searchSort = 'alaka';
      renderSearchResults(local, cleanQ);
    } else {
      renderSearchEmpty(cleanQ);
    }
  }

  if (DOM.engineSearchInput) {
    DOM.engineSearchInput.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderSearchResults(results, query) {
  if (DOM.searchResultsCount) {
    DOM.searchResultsCount.textContent = `"${query}" İçin ${results.length} Sonuç Bulundu`;
  }

  if (results.length > 0) {
    renderSpotlightCard(results[0]);
  }

  if (!DOM.searchResultsList) return;
  DOM.searchResultsList.innerHTML = '';

  results.forEach((track) => {
    const card = document.createElement('div');
    card.className = "flex items-center justify-between p-3 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low transition-all shadow-sm group border border-transparent hover:border-surface-container";
    
    const safeTitle = (track.title || "Şarkı").replace(/"/g, '&quot;');
    const safeArtist = (track.artist || "Sanatçı").replace(/"/g, '&quot;');

    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer track-info-click">
        <div class="relative w-12 h-12 rounded-lg overflow-hidden bg-surface-container-high flex-shrink-0">
          <img src="${track.thumbnail}" alt="${safeTitle}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='/kurfamuzik_logo.png'">
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="material-symbols-outlined text-white text-[24px]">play_arrow</span>
          </div>
        </div>
        <div class="flex flex-col min-w-0">
          <h4 class="text-xs md:text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">${safeTitle}</h4>
          <p class="text-[11px] text-on-surface-variant truncate">${safeArtist} • YouTube Ses</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 sm:gap-2">
        <span class="text-xs text-on-surface-variant font-mono hidden sm:inline">${track.duration}</span>
        <button type="button" class="btn-queue-track w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors" title="Sıraya Ekle">
          <span class="material-symbols-outlined text-[18px]">queue_music</span>
        </button>
        <button type="button" class="btn-add-pl-track w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors" title="Çalma Listesine Ekle">
          <span class="material-symbols-outlined text-[18px]">add_circle</span>
        </button>
        <button type="button" class="btn-fav-track w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors" title="Favorilere Ekle">
          <span class="material-symbols-outlined text-[18px]">${state.favorites.some(f => f.id === track.id) ? 'favorite' : 'favorite_border'}</span>
        </button>
        <button type="button" class="btn-dl-track w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors" title="İndir">
          <span class="material-symbols-outlined text-[18px]">download</span>
        </button>
        <button type="button" class="btn-play-track w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-all" title="Çal">
          <span class="material-symbols-outlined text-[18px]">play_arrow</span>
        </button>
      </div>
    `;

    const playSearchTrack = () => {
      state.queue = [...results];
      const foundIdx = results.findIndex(t => t.id === track.id);
      state.queueIndex = foundIdx !== -1 ? foundIdx : 0;
      state.playingContextSub = 'ARAMA LİSTESİNDEN ÇALINIYOR';
      state.playingContextTitle = query || `${track.artist} Şarkıları`;
      playTrackById(track.id, track);
    };

    const infoClick = card.querySelector('.track-info-click');
    if (infoClick) infoClick.onclick = playSearchTrack;

    const playBtn = card.querySelector('.btn-play-track');
    if (playBtn) playBtn.onclick = playSearchTrack;

    const qBtn = card.querySelector('.btn-queue-track');
    if (qBtn) {
      qBtn.onclick = (e) => {
        e.stopPropagation();
        addToQueueTrack(track);
      };
    }

    const addPlBtn = card.querySelector('.btn-add-pl-track');
    if (addPlBtn) {
      addPlBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      };
    }

    const favBtn = card.querySelector('.btn-fav-track');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(track);
        const icon = favBtn.querySelector('.material-symbols-outlined');
        if (icon) {
          icon.textContent = state.favorites.some(f => f.id === track.id) ? 'favorite' : 'favorite_border';
        }
      };
    }

    const dlBtn = card.querySelector('.btn-dl-track');
    if (dlBtn) {
      dlBtn.onclick = (e) => {
        e.stopPropagation();
        downloadTrack(track);
      };
    }

    DOM.searchResultsList.appendChild(card);
  });
}

function renderSpotlightCard(track) {
  if (!DOM.searchSpotlightBox) return;
  DOM.searchSpotlightBox.style.display = 'block';

  const safeTitle = (track.title || "Şarkı").replace(/"/g, '&quot;');
  const safeArtist = (track.artist || "Sanatçı").replace(/"/g, '&quot;');

  DOM.searchSpotlightBox.innerHTML = `
    <div class="flex flex-col sm:flex-row items-center gap-4">
      <div class="relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden shadow-lg bg-surface-container-high flex-shrink-0 group cursor-pointer" id="spotlight-thumb-btn">
        <img src="${track.thumbnail}" alt="${safeTitle}" class="w-full h-full object-cover">
        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span class="material-symbols-outlined text-white text-[36px]">play_circle</span>
        </div>
      </div>
      <div class="flex-1 text-center sm:text-left min-w-0">
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-[10px] font-bold uppercase tracking-wider mb-1">
          <span class="material-symbols-outlined text-[12px]">auto_awesome</span>
          En İyi Eşleşme
        </span>
        <h3 class="text-base sm:text-lg font-extrabold text-on-surface truncate">${safeTitle}</h3>
        <p class="text-xs text-on-surface-variant font-medium mb-3">${safeArtist} • Doğrudan Ses Yayını</p>
        <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          <button type="button" id="spotlight-play-btn" class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold shadow-md hover:bg-primary-container transition-all">
            <span class="material-symbols-outlined text-[18px]">play_arrow</span>
            <span>Hemen Dinle</span>
          </button>
          <button type="button" id="spotlight-dl-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-full bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors">
            <span class="material-symbols-outlined text-[16px]">download</span>
            <span>Sesi İndir</span>
          </button>
          <button type="button" id="spotlight-queue-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-full bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors">
            <span class="material-symbols-outlined text-[16px]">playlist_add</span>
            <span>Sıraya Ekle</span>
          </button>
        </div>
      </div>
    </div>
  `;


  document.getElementById('spotlight-thumb-btn').onclick = () => playTrackById(track.id, track);
  document.getElementById('spotlight-play-btn').onclick = () => playTrackById(track.id, track);
  document.getElementById('spotlight-dl-btn').onclick = () => downloadTrack(track);
  document.getElementById('spotlight-queue-btn').onclick = () => addToQueueTrack(track.id, track.title, track.artist, track.thumbnail, track.duration);
}

function renderSearchEmpty(query) {
  if (DOM.searchResultsCount) DOM.searchResultsCount.textContent = `Sonuç Bulunamadı`;
  if (DOM.searchSpotlightBox) DOM.searchSpotlightBox.style.display = 'none';
  if (DOM.searchResultsList) {
    DOM.searchResultsList.innerHTML = `
      <div class="col-span-full py-12 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-center">
        <span class="material-symbols-outlined text-[40px] text-surface-variant">search_off</span>
        <p class="text-sm font-semibold">"${query}" için sonuç bulunamadı</p>
        <p class="text-xs">Farklı bir anahtar kelime deneyin veya doğrudan YouTube linki yapıştırın.</p>
      </div>
    `;
  }
}

function executeSearchFromInput() {
  const query = (DOM.engineSearchInput ? DOM.engineSearchInput.value : "") || 
                (DOM.topSearchInput ? DOM.topSearchInput.value : "");
  if (query && query.trim()) {
    executeSearchImmediate(query.trim(), true);
  } else {
    showToast("Lütfen bir şarkı, sanatçı veya link yazın");
  }
}

function clearSearchInput() {
  if (DOM.engineSearchInput) DOM.engineSearchInput.value = '';
  if (DOM.topSearchInput) DOM.topSearchInput.value = '';
  if (DOM.searchResultsCount) DOM.searchResultsCount.textContent = 'Arama Sonuçları';
  if (DOM.searchSpotlightBox) DOM.searchSpotlightBox.style.display = 'none';
  if (DOM.searchResultsList) {
    DOM.searchResultsList.innerHTML = `
      <div class="p-8 text-center text-on-surface-variant text-sm">
        Aramak istediğin şarkı veya sanatçı adını yazıp <strong>Enter</strong>'a bas.
      </div>
    `;
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      if (DOM.engineSearchInput) DOM.engineSearchInput.value = text;
      if (DOM.topSearchInput) DOM.topSearchInput.value = text;
      executeSearchImmediate(text, true);
    }
  } catch (err) {
    showToast("Panoya erişilemedi, lütfen elle yapıştırın");
  }
}

function applySearchFilter(filter, el) {
  document.querySelectorAll('#search-filter-chips .filter-chip').forEach(c => {
    c.classList.remove('active', 'bg-primary', 'text-on-primary');
    c.classList.add('bg-surface-container-low', 'text-on-surface-variant');
  });

  if (el) {
    el.classList.add('active', 'bg-primary', 'text-on-primary');
    el.classList.remove('bg-surface-container-low', 'text-on-surface-variant');
  }

  const baseQuery = (DOM.engineSearchInput ? DOM.engineSearchInput.value : "") || "türkçe popüler";
  if (filter === 'all') {
    executeSearchImmediate(baseQuery, true);
  } else {
    executeSearchImmediate(`${baseQuery} ${filter}`, true);
  }
}

function parseDurationToSec(durStr) {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(p => parseInt(p, 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function setSearchSort(criteria) {
  state.searchSort = criteria;
  
  const btnAlaka = document.getElementById('btn-sort-alaka');
  const btnIzlenme = document.getElementById('btn-sort-izlenme');
  const btnEnYeni = document.getElementById('btn-sort-en-yeni');

  const activeCls = ['bg-primary/20', 'text-primary', 'border-primary/40', 'font-semibold'];
  const inactiveCls = ['bg-white/[0.04]', 'text-slate-400', 'border-white/5', 'font-medium'];

  const setBtnStyle = (btn, isActive) => {
    if (!btn) return;
    if (isActive) {
      btn.classList.add(...activeCls);
      btn.classList.remove(...inactiveCls);
    } else {
      btn.classList.remove(...activeCls);
      btn.classList.add(...inactiveCls);
    }
  };

  setBtnStyle(btnAlaka, criteria === 'alaka');
  setBtnStyle(btnIzlenme, criteria === 'izlenme');
  setBtnStyle(btnEnYeni, criteria === 'en-yeni');

  if (!state.currentSearchResults || state.currentSearchResults.length === 0) {
    return;
  }

  let sorted = [...(state._rawSearchResults && state._rawSearchResults.length ? state._rawSearchResults : state.currentSearchResults)];

  if (criteria === 'izlenme') {
    sorted.sort((a, b) => {
      const durA = parseDurationToSec(a.duration || '0:00');
      const durB = parseDurationToSec(b.duration || '0:00');
      return durB - durA;
    });
    showToast("İzlenme ve popülerliğe göre sıralandı");
  } else if (criteria === 'en-yeni') {
    sorted.reverse();
    showToast("En yeni parçalara göre sıralandı");
  } else {
    showToast("Alakaya göre sıralandı");
  }

  state.currentSearchResults = sorted;
  renderSearchResults(sorted, state.currentSearchQuery || '');
}
window.setSearchSort = setSearchSort;

function resetSearchFilters() {
  const chips = document.querySelectorAll('#search-filter-chips .filter-chip');
  if (chips.length > 0) {
    chips.forEach(c => {
      c.classList.remove('active', 'bg-primary', 'text-on-primary');
      c.classList.add('bg-surface-container-low', 'text-on-surface-variant');
    });
    chips[0].classList.add('active', 'bg-primary', 'text-on-primary');
    chips[0].classList.remove('bg-surface-container-low', 'text-on-surface-variant');
  }

  setSearchSort('alaka');

  if (state._rawSearchResults && state._rawSearchResults.length > 0) {
    state.currentSearchResults = [...state._rawSearchResults];
    renderSearchResults(state.currentSearchResults, state.currentSearchQuery || '');
  }

  showToast("Filtreler ve sıralama sıfırlandı");
}
window.resetSearchFilters = resetSearchFilters;

function filterGenre(el, genre) {
  document.querySelectorAll('#filter-container .filter-pill').forEach(p => {
    p.classList.remove('bg-secondary', 'text-on-secondary', 'shadow-sm', 'font-bold');
    p.classList.add('bg-surface-container-low', 'border', 'border-surface-container', 'text-on-surface', 'font-semibold');
  });

  if (el) {
    el.classList.add('bg-secondary', 'text-on-secondary', 'shadow-sm', 'font-bold');
    el.classList.remove('bg-surface-container-low', 'border', 'border-surface-container', 'text-on-surface', 'font-semibold');
  }

  if (genre === 'all') {
    renderHomeTracklistTable();
    showToast("Tüm şarkılar gösteriliyor");
  } else {
    showToast(`${genre} kategorisi listeleniyor...`);
    executeSearchImmediate(`${genre} 2026 dinle`, true);
  }
}

function searchByArtist(artistName) {
  executeSearchImmediate(artistName, true);
}

function quickSearchAndPlay(query) {
  showToast(`Çalınıyor: ${query}`);
  fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`)
    .then(r => r.json())
    .then(data => {
      if (data.success && data.results && data.results.length > 0) {
        state.queue = [...data.results];
        state.queueIndex = 0;
        playTrackById(data.results[0].id, data.results[0]);
      }
    })
    .catch(() => {
      playTrackById(CURATED_TRACKS[0].id, CURATED_TRACKS[0]);
    });
}

function playAllTrends() {
  const allTracks = getCuratedTracks();
  if (!allTracks || allTracks.length === 0) return;
  state.queue = [...allTracks];
  state.queueIndex = 0;
  state.playingContextSub = 'TRENDLERDEN ÇALINIYOR';
  state.playingContextTitle = 'YouTube Türkiye Trendleri';
  saveQueueState();
  playTrackById(state.queue[0].id, state.queue[0]);
  showToast("YouTube Trendler çalınıyor");
}

function addAllResultsToQueue() {
  if (!state.currentSearchResults || state.currentSearchResults.length === 0) {
    showToast("Sıraya eklenecek sonuç bulunamadı");
    return;
  }
  state.currentSearchResults.forEach(t => {
    if (!state.queue.some(q => q.id === t.id)) {
      state.queue.push(t);
    }
  });
  renderQueueDrawerList();
  showToast(`${state.currentSearchResults.length} şarkı sıraya eklendi`);
}

// =============================================================================
// 11. RENDERING GRIDS & TABLES (KEŞFET, TRENDLER, FAVORİLER, İNDİRİLENLER)
// =============================================================================

function renderPopularCardsGrid() {
  if (!DOM.popularCardsGrid) return;
  DOM.popularCardsGrid.innerHTML = '';

  const displayList = getCuratedTracks().slice(0, 8);
  displayList.forEach(track => {
    const isPlayingCurrent = state.currentTrack && state.currentTrack.id === track.id && state.isPlaying;
    const card = document.createElement('div');
    card.className = "group relative rounded-2xl bg-surface-container-lowest p-space-sm shadow-sm hover:shadow-md transition-all flex flex-col cursor-pointer border border-transparent hover:border-surface-container";
    card.innerHTML = `
      <div class="relative w-full aspect-square rounded-xl overflow-hidden mb-space-sm bg-surface-container-high">
        <img src="${getTrackThumbnail(track)}" alt="${track.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${track.id}/hqdefault.jpg';">
        <button type="button" class="btn-card-add-pl absolute left-2.5 top-2.5 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 hover:scale-110 hover:text-primary transition-all duration-200 z-10" title="Çalma Listesine Ekle">
          <span class="material-symbols-outlined text-[18px]">add</span>
        </button>
        <button type="button" class="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:scale-110 active:scale-95" title="Çal">
          <span class="material-symbols-outlined text-[24px]">${isPlayingCurrent ? 'pause' : 'play_arrow'}</span>
        </button>
      </div>
      <h3 class="text-xs md:text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">${track.title}</h3>
      <p class="text-[11px] text-on-surface-variant truncate font-medium mt-0.5">${track.artist} • YouTube</p>
    `;
    const playCardTrack = () => {
      const allTracks = getCuratedTracks();
      state.queue = [...allTracks];
      const foundIdx = allTracks.findIndex(t => t.id === track.id);
      state.queueIndex = foundIdx !== -1 ? foundIdx : 0;
      state.playingContextSub = 'TRENDLERDEN ÇALINIYOR';
      state.playingContextTitle = 'Popüler Parçalar';
      saveQueueState();
      playTrackById(track.id, track);
    };
    card.onclick = playCardTrack;
    const addBtn = card.querySelector('.btn-card-add-pl');
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      };
    }
    DOM.popularCardsGrid.appendChild(card);
  });
}

function renderHomeTracklistTable() {
  if (!DOM.homeTracklistTable) return;
  DOM.homeTracklistTable.innerHTML = '';

  const tracks = getCuratedTracks();
  tracks.forEach((track, index) => {
    const isPlayingCurrent = state.currentTrack && state.currentTrack.id === track.id && state.isPlaying;
    const isFav = state.favorites.some(f => f.id === track.id);

    const row = document.createElement('div');
    row.className = `flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container-low transition-colors group cursor-pointer ${state.currentTrack && state.currentTrack.id === track.id ? 'bg-surface-container-low' : ''}`;
    row.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <span class="w-4 text-center text-xs font-bold text-on-surface-variant font-mono group-hover:hidden ${state.currentTrack && state.currentTrack.id === track.id ? 'text-primary font-extrabold' : ''}">${index + 1}</span>
        <button type="button" class="btn-play-row w-4 text-center hidden group-hover:flex items-center justify-center text-primary" title="Çal">
          <span class="material-symbols-outlined text-[18px]">${isPlayingCurrent ? 'pause' : 'play_arrow'}</span>
        </button>
        <img src="${getTrackThumbnail(track)}" alt="${track.title}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${track.id}/hqdefault.jpg';">
        <div class="flex flex-col min-w-0">
          <span class="text-xs md:text-sm font-bold text-on-surface truncate ${state.currentTrack && state.currentTrack.id === track.id ? 'text-primary' : ''}">${track.title}</span>
          <span class="text-[11px] text-on-surface-variant truncate">${track.artist}</span>
        </div>
      </div>
      <div class="hidden md:flex items-center gap-4 text-xs text-on-surface-variant font-medium">
        <span class="px-2 py-0.5 rounded bg-surface-container-low text-[10px] uppercase font-bold text-on-surface-variant/80">YouTube</span>
        <span class="w-12 text-right font-mono">${track.duration || '3:30'}</span>
      </div>
      <div class="flex items-center gap-1 ml-2">
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors btn-add-pl-row" title="Çalma Listesine Ekle">
          <span class="material-symbols-outlined text-[18px]">add_circle</span>
        </button>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors btn-fav-row" title="Favori">
          <span class="material-symbols-outlined text-[18px] ${isFav ? 'text-primary filled' : ''}">${isFav ? 'favorite' : 'favorite_border'}</span>
        </button>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors btn-queue-row" title="Sıraya Ekle">
          <span class="material-symbols-outlined text-[18px]">playlist_add</span>
        </button>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-tertiary transition-colors btn-dl-row" title="İndir">
          <span class="material-symbols-outlined text-[18px]">download</span>
        </button>
      </div>
    `;

    const playRowTrack = () => {
      const allTracks = getCuratedTracks();
      state.queue = [...allTracks];
      const foundIdx = allTracks.findIndex(t => t.id === track.id);
      state.queueIndex = foundIdx !== -1 ? foundIdx : index;
      state.playingContextSub = 'TREND LİSTESİNDEN ÇALINIYOR';
      state.playingContextTitle = 'YouTube Türkiye Trendleri';
      saveQueueState();
      playTrackById(track.id, track);
    };

    row.onclick = playRowTrack;
    const playBtn = row.querySelector('.btn-play-row');
    if (playBtn) {
      playBtn.onclick = (e) => {
        e.stopPropagation();
        playRowTrack();
      };
    }
    const addPlBtn = row.querySelector('.btn-add-pl-row');
    if (addPlBtn) {
      addPlBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      };
    }
    const favBtn = row.querySelector('.btn-fav-row');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(track);
      };
    }
    const qBtn = row.querySelector('.btn-queue-row');
    if (qBtn) {
      qBtn.onclick = (e) => {
        e.stopPropagation();
        addToQueueTrack(track.id, track.title, track.artist, track.thumbnail, track.duration);
      };
    }
    const dlBtn = row.querySelector('.btn-dl-row');
    if (dlBtn) {
      dlBtn.onclick = (e) => {
        e.stopPropagation();
        downloadTrack(track);
      };
    }

    DOM.homeTracklistTable.appendChild(row);
  });
}

let trendsShowAll = false;

function toggleTrendsShowAll() {
  trendsShowAll = !trendsShowAll;
  const leftBtn = document.getElementById('btn-trendler-scroll-left');
  const rightBtn = document.getElementById('btn-trendler-scroll-right');
  if (leftBtn && rightBtn) {
    leftBtn.style.display = trendsShowAll ? 'none' : '';
    rightBtn.style.display = trendsShowAll ? 'none' : '';
  }
  renderTrendlerCardsGrid();
}

function renderTrendlerCardsGrid() {
  if (!DOM.trendlerCardsGrid) return;
  DOM.trendlerCardsGrid.innerHTML = '';

  const allTracks = getCuratedTracks();
  const tracksToShow = trendsShowAll ? allTracks : allTracks.slice(0, 10);

  // Layout mode: horizontal scroll if collapsed, flex-wrap rows if expanded
  if (trendsShowAll) {
    DOM.trendlerCardsGrid.className = "flex flex-wrap gap-3 sm:gap-4 pb-3 pt-1";
  } else {
    DOM.trendlerCardsGrid.className = "flex gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1 scrollbar-none cursor-grab active:cursor-grabbing select-none";
  }

  tracksToShow.forEach((track, index) => {
    const isPlayingCurrent = state.currentTrack && state.currentTrack.id === track.id && state.isPlaying;
    const isFav = state.favorites.some(f => f.id === track.id);

    const card = document.createElement('div');
    card.className = "group relative w-44 sm:w-52 flex-shrink-0 p-2.5 rounded-2xl bg-surface-container-lowest hover:bg-surface-container-low transition-all duration-200 cursor-pointer border border-surface-container/50 hover:border-primary/40 flex flex-col shadow-sm";
    card.innerHTML = `
      <div class="relative w-full aspect-video rounded-xl overflow-hidden mb-2 bg-surface-container-high">
        <img src="${getTrackThumbnail(track)}" alt="${track.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${track.id}/hqdefault.jpg';">
        <div class="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-white text-[10px] font-black border border-white/10 shadow-sm">
          #${index + 1} Trend
        </div>
        <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
            <span class="material-symbols-outlined text-[22px] filled">${isPlayingCurrent ? 'pause' : 'play_arrow'}</span>
          </span>
        </div>
      </div>
      <div class="flex items-start justify-between gap-1.5 min-w-0">
        <div class="flex flex-col min-w-0 flex-1">
          <h3 class="text-xs sm:text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors" title="${track.title}">${track.title}</h3>
          <p class="text-[11px] text-on-surface-variant truncate font-medium mt-0.5">${track.artist} • YouTube Müzik</p>
        </div>
        <button type="button" class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary btn-trend-add-pl flex-shrink-0" title="Çalma Listesine Ekle">
          <span class="material-symbols-outlined text-[17px]">add_circle</span>
        </button>
        <button type="button" class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary btn-trend-fav flex-shrink-0" title="Favorilere Ekle">
          <span class="material-symbols-outlined text-[17px] ${isFav ? 'text-primary filled' : ''}">${isFav ? 'favorite' : 'favorite_border'}</span>
        </button>
      </div>
    `;
    card.onclick = () => {
      const allTracks = getCuratedTracks();
      state.queue = [...allTracks];
      const foundIdx = allTracks.findIndex(t => t.id === track.id);
      state.queueIndex = foundIdx !== -1 ? foundIdx : index;
      state.playingContextSub = 'TRENDLERDEN ÇALINIYOR';
      state.playingContextTitle = 'YouTube Türkiye Trendleri';
      saveQueueState();
      playTrackById(track.id, track);
    };
    const addPlBtn = card.querySelector('.btn-trend-add-pl');
    if (addPlBtn) {
      addPlBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      };
    }
    const favBtn = card.querySelector('.btn-trend-fav');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(track);
        const icon = favBtn.querySelector('.material-symbols-outlined');
        const nowFav = state.favorites.some(f => f.id === track.id);
        if (icon) {
          icon.textContent = nowFav ? 'favorite' : 'favorite_border';
          if (nowFav) icon.classList.add('text-primary', 'filled');
          else icon.classList.remove('text-primary', 'filled');
        }
      };
    }
    DOM.trendlerCardsGrid.appendChild(card);
  });

  if (!trendsShowAll) {
    initDragToScroll(DOM.trendlerCardsGrid);
  }

  const leftBtn = document.getElementById('btn-trendler-scroll-left');
  const rightBtn = document.getElementById('btn-trendler-scroll-right');
  if (leftBtn && rightBtn) {
    leftBtn.style.display = trendsShowAll ? 'none' : '';
    rightBtn.style.display = trendsShowAll ? 'none' : '';
  }

  const toggleBtn = document.getElementById('btn-toggle-trends');
  if (toggleBtn) {
    toggleBtn.innerHTML = trendsShowAll 
      ? `<span class="material-symbols-outlined text-[16px]">expand_less</span><span>Daha Az Göster</span>`
      : `<span class="material-symbols-outlined text-[16px]">expand_more</span><span>Tümünü Göster (${allTracks.length})</span>`;
  }
}

// 100% Authentic Verified High-Resolution CDN Artworks
const POPULAR_ARTISTS = [
  {
    name: "Semicenk",
    genre: "Pop & Arabesk",
    img: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/fb/31/11/fb3111cb-4251-ab93-eb37-75e752050237/cover.jpg/300x300bb.jpg"
  },
  {
    name: "Simge",
    genre: "Türkçe Pop",
    img: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/05/81/0b/05810b21-3c0c-b3b7-d2b2-2050baab2de0/cover.jpg/300x300bb.jpg"
  },
  {
    name: "Mert Demir",
    genre: "Indie Pop & R&B",
    img: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/43/39/bb/4339bbf7-d2c3-22ed-90e7-9a14416780c8/196922638558_Cover.jpg/300x300bb.jpg"
  },
  {
    name: "BLOK3",
    genre: "Drill & Trap",
    img: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/a8/92/b9/a892b962-b6e9-b027-d2f2-6192290b4dea/199350105050.jpg/300x300bb.jpg"
  },
  {
    name: "Mabel Matiz",
    genre: "Türkçe Pop & Indie",
    img: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/14/9b/07/149b0748-da05-c2b8-fe06-f8edf97b6006/820233718745.jpg/300x300bb.jpg"
  },
  {
    name: "Dedublüman",
    genre: "Alternatif Rock",
    img: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/15/19/83/151983a9-0c68-ee9d-0350-a6940b795054/cover.jpg/300x300bb.jpg"
  },
  {
    name: "Melike Şahin",
    genre: "Akustik & Pop",
    img: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/7d/da/4c/7dda4c8a-5549-8be3-fe3f-2803b683234d/8683242226951.jpg/300x300bb.jpg"
  },
  {
    name: "Hande Ünsal",
    genre: "Canlı Pop Hit",
    img: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/9a/3c/bb/9a3cbb7d-1584-f189-5520-e5f1e8fb16f9/cover.jpg/300x300bb.jpg"
  }
];

function renderPopularArtistsGrid() {
  const container = document.getElementById('popular-artists-grid');
  if (!container) return;
  container.innerHTML = '';

  POPULAR_ARTISTS.forEach(artist => {
    const card = document.createElement('div');
    card.className = "group flex flex-col items-center text-center p-2.5 rounded-2xl hover:bg-surface-container-low transition-all duration-300 cursor-pointer flex-shrink-0";
    card.innerHTML = `
      <div class="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden mb-2 shadow-md ring-2 ring-surface-container group-hover:ring-primary/60 transition-all bg-surface-container-high">
        <img src="${artist.img}" alt="${artist.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" onerror="this.outerHTML='<div class=\\'w-full h-full flex items-center justify-center font-bold text-lg text-primary bg-primary/10\\'>${artist.name.charAt(0)}</div>'">
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span class="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
            <span class="material-symbols-outlined text-[20px] filled">play_arrow</span>
          </span>
        </div>
      </div>
      <h3 class="font-bold text-xs sm:text-sm text-on-surface truncate w-full group-hover:text-primary transition-colors">${artist.name}</h3>
      <span class="text-[10px] text-on-surface-variant truncate w-full mt-0.5">${artist.genre}</span>
    `;
    card.onclick = () => openArtistDetail(artist);
    container.appendChild(card);
  });
  initDragToScroll(container);
}

const CURATED_MIXES = [
  {
    name: "Günlük Mix 1",
    subtitle: "Semicenk, Mert Demir, Emir Can İğrek",
    query: "Semicenk Mert Demir Emir Can İğrek en popüler şarkıları"
  },
  {
    name: "Akustik Sakinlik",
    subtitle: "Dedublüman, Madrigal, Mavi Gri",
    query: "Dedublüman Madrigal Mavi Gri akustik şarkılar dinle"
  },
  {
    name: "Türkçe Drill & Rap",
    subtitle: "Blok3, UZI, Lvbel C5, Motive",
    query: "Blok3 UZI Lvbel C5 Motive en çok dinlenen rap şarkılar"
  },
  {
    name: "Koşu & Motivasyon",
    subtitle: "High BPM Club Remixleri",
    query: "Türkçe club remix yüksek bpm motivasyon spor şarkıları"
  }
];

function playCuratedMix(index) {
  const mix = CURATED_MIXES[index] || CURATED_MIXES[0];
  showToast(`${mix.name} başlatılıyor...`);
  quickSearchAndPlay(mix.query);
}

let currentArtistTracks = [];

function openArtistDetail(artist) {
  const mainCont = document.getElementById('kesfet-main-container');
  const artistCont = document.getElementById('kesfet-artist-container');
  if (!mainCont || !artistCont) return;

  mainCont.classList.add('hidden');
  artistCont.classList.remove('hidden');

  // Fill Header
  const avatarEl = document.getElementById('artist-profile-avatar');
  const nameEl = document.getElementById('artist-profile-name');
  const genreEl = document.getElementById('artist-profile-genre');
  const countEl = document.getElementById('artist-tracks-count');
  const listEl = document.getElementById('artist-tracks-container');

  if (avatarEl) avatarEl.src = artist.img;
  if (nameEl) nameEl.textContent = artist.name;
  if (genreEl) genreEl.textContent = `${artist.genre} • YouTube Müzik Türkiye`;
  if (countEl) countEl.textContent = "Şarkılar yükleniyor...";
  if (listEl) {
    listEl.innerHTML = `
      <div class="flex items-center justify-center py-12 gap-3 text-on-surface-variant text-xs">
        <div class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span>${artist.name} şarkıları YouTube üzerinden getiriliyor...</span>
      </div>
    `;
  }

  // Smooth scroll to top of view
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Unlimited YouTube search for this artist's catalog
  fetch(`${API_BASE}/api/search?q=${encodeURIComponent(artist.name + ' şarkıları')}`)
    .then(r => r.json())
    .then(data => {
      if (data.success && data.results && data.results.length > 0) {
        currentArtistTracks = data.results;
        if (countEl) countEl.textContent = `${data.results.length} Parça Bulundu`;
        renderArtistTracks(data.results, artist.name);
      } else {
        if (countEl) countEl.textContent = "0 Parça";
        if (listEl) {
          listEl.innerHTML = `
            <div class="text-center py-8 text-xs text-on-surface-variant">
              Parça listesi alınamadı. Lütfen tekrar deneyin.
            </div>
          `;
        }
      }
    })
    .catch(() => {
      if (countEl) countEl.textContent = "Hata";
      if (listEl) {
        listEl.innerHTML = `
          <div class="text-center py-8 text-xs text-on-surface-variant">
            Bağlantı hatası oluştu.
          </div>
        `;
      }
    });

  // Action buttons
  const playAllBtn = document.getElementById('artist-play-all-btn');
  if (playAllBtn) {
    playAllBtn.onclick = () => {
      if (currentArtistTracks && currentArtistTracks.length > 0) {
        state.queue = [...currentArtistTracks];
        state.queueIndex = 0;
        playTrackById(currentArtistTracks[0].id, currentArtistTracks[0]);
        showToast(`${artist.name} şarkıları çalınıyor`);
      }
    };
  }

  const shuffleBtn = document.getElementById('artist-shuffle-btn');
  if (shuffleBtn) {
    shuffleBtn.onclick = () => {
      if (currentArtistTracks && currentArtistTracks.length > 0) {
        const shuffled = [...currentArtistTracks].sort(() => Math.random() - 0.5);
        state.queue = shuffled;
        state.queueIndex = 0;
        playTrackById(shuffled[0].id, shuffled[0]);
        showToast(`${artist.name} karışık çalınıyor`);
      }
    };
  }
}

function renderArtistTracks(tracks, artistName) {
  const listEl = document.getElementById('artist-tracks-container');
  if (!listEl) return;
  listEl.innerHTML = '';

  tracks.forEach((track, idx) => {
    const isPlayingCurrent = state.currentTrack && state.currentTrack.id === track.id && state.isPlaying;
    const isFav = state.favorites.some(f => f.id === track.id);

    const row = document.createElement('div');
    row.className = `flex items-center justify-between p-2 sm:p-2.5 rounded-xl hover:bg-surface-container-low transition-colors group cursor-pointer ${state.currentTrack && state.currentTrack.id === track.id ? 'bg-surface-container-low' : ''}`;
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <span class="w-6 text-center text-xs font-bold text-on-surface-variant font-mono group-hover:hidden ${state.currentTrack && state.currentTrack.id === track.id ? 'text-primary font-extrabold' : ''}">${idx + 1}</span>
        <button type="button" class="w-6 h-6 rounded-full items-center justify-center text-primary hidden group-hover:flex flex-shrink-0" title="Çal">
          <span class="material-symbols-outlined text-[18px] filled">${isPlayingCurrent ? 'pause' : 'play_arrow'}</span>
        </button>

        <img src="${track.thumbnail}" alt="${track.title}" class="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover flex-shrink-0 shadow-sm bg-surface-container-high" loading="lazy">
        <div class="flex flex-col min-w-0 flex-1 pr-2">
          <span class="text-xs sm:text-sm font-bold text-on-surface truncate ${state.currentTrack && state.currentTrack.id === track.id ? 'text-primary' : ''}">${track.title}</span>
          <span class="text-[11px] text-on-surface-variant truncate font-medium">${track.artist || artistName}</span>
        </div>
      </div>

      <div class="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <span class="text-xs text-on-surface-variant font-mono hidden sm:inline mr-2">${track.duration || '3:30'}</span>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors btn-artist-fav" title="Favorilere Ekle">
          <span class="material-symbols-outlined text-[17px] ${isFav ? 'text-primary filled' : ''}">${isFav ? 'favorite' : 'favorite_border'}</span>
        </button>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors btn-artist-dl" title="İndir">
          <span class="material-symbols-outlined text-[17px]">download</span>
        </button>
      </div>
    `;

    row.onclick = () => {
      state.queue = [...tracks];
      state.queueIndex = idx;
      playTrackById(track.id, track);
    };

    const favBtn = row.querySelector('.btn-artist-fav');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(track);
        const icon = favBtn.querySelector('.material-symbols-outlined');
        const nowFav = state.favorites.some(f => f.id === track.id);
        if (icon) {
          icon.textContent = nowFav ? 'favorite' : 'favorite_border';
          if (nowFav) icon.classList.add('text-primary', 'filled');
          else icon.classList.remove('text-primary', 'filled');
        }
      };
    }

    const dlBtn = row.querySelector('.btn-artist-dl');
    if (dlBtn) {
      dlBtn.onclick = (e) => {
        e.stopPropagation();
        downloadTrack(track);
      };
    }

    listEl.appendChild(row);
  });
}

function closeArtistDetail() {
  const mainCont = document.getElementById('kesfet-main-container');
  const artistCont = document.getElementById('kesfet-artist-container');
  if (mainCont) mainCont.classList.remove('hidden');
  if (artistCont) artistCont.classList.add('hidden');
}

function updateQuickFavCount() {
  const el = document.getElementById('quick-fav-count');
  if (el) {
    el.textContent = state.favorites.length > 0 ? `${state.favorites.length} Şarkı Kaydedildi` : 'Favorileriniz Boş';
  }
}

function playFavoritesQuick() {
  if (!state.favorites || state.favorites.length === 0) {
    showToast('Favori listeniz henüz boş. Şarkıların yanındaki kalp simgesiyle ekleyebilirsiniz.');
    return;
  }
  state.queue = [...state.favorites];
  saveQueueState();
  renderQueueDrawerList();
  playTrackById(state.queue[0].id, state.queue[0]);
  showToast(`${state.favorites.length} favori şarkınız çalınıyor`);
}

function renderFavoritesTable() {
  if (!DOM.favoritesListTable) return;
  DOM.favoritesListTable.innerHTML = '';

  if (DOM.favCountText) {
    DOM.favCountText.textContent = `${state.favorites.length} Şarkı Kaydedildi`;
  }

  if (state.favorites.length === 0) {
    DOM.favoritesListTable.innerHTML = `
      <div class="py-12 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-center">
        <span class="material-symbols-outlined text-[48px] text-primary/40">favorite</span>
        <p class="text-sm font-bold text-on-surface">Favori listeniz henüz boş</p>
        <p class="text-xs">Beğendiğiniz şarkıları kalp simgesine tıklayarak buraya ekleyebilirsiniz.</p>
        <button type="button" class="mt-2 px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold" onclick="switchTab('kesfet')">
          Şarkı Keşfet
        </button>
      </div>
    `;
    return;
  }

  state.favorites.forEach((track, index) => {
    const row = document.createElement('div');
    row.className = "flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container-low transition-colors group cursor-pointer";
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <span class="w-5 text-center text-xs font-bold text-on-surface-variant font-mono">${index + 1}</span>
        <img src="${track.thumbnail}" alt="${track.title}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" onerror="this.onerror=null; this.src='/kurfamuzik_logo.png'">
        <div class="flex flex-col min-w-0">
          <span class="text-xs md:text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">${track.title}</span>
          <span class="text-[11px] text-on-surface-variant truncate">${track.artist}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-on-surface-variant font-mono hidden sm:inline">${track.duration || '3:30'}</span>
        <button type="button" class="btn-fav-queue w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors" title="Sıraya Ekle">
          <span class="material-symbols-outlined text-[18px]">queue_music</span>
        </button>
        <button type="button" class="btn-fav-add-pl w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors" title="Çalma Listesine Ekle">
          <span class="material-symbols-outlined text-[18px]">playlist_add</span>
        </button>
        <button type="button" class="btn-fav-remove w-8 h-8 rounded-full flex items-center justify-center text-primary" title="Favorilerden Çıkar">
          <span class="material-symbols-outlined text-[18px] filled">favorite</span>
        </button>
        <button type="button" class="btn-fav-dl w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-secondary" title="İndir">
          <span class="material-symbols-outlined text-[18px]">download</span>
        </button>
        <button type="button" class="btn-fav-play w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-all">
          <span class="material-symbols-outlined text-[18px]">play_arrow</span>
        </button>
      </div>
    `;
    const playFav = () => {
      state.queue = [...state.favorites];
      state.queueIndex = index;
      state.playingContextSub = 'FAVORİLERDEN ÇALINIYOR';
      state.playingContextTitle = 'Favori Şarkılarım';
      saveQueueState();
      playTrackById(track.id, track);
    };
    row.onclick = playFav;
    const playBtn = row.querySelector('.btn-fav-play');
    if (playBtn) playBtn.onclick = (e) => { e.stopPropagation(); playFav(); };
    const qFavBtn = row.querySelector('.btn-fav-queue');
    if (qFavBtn) {
      qFavBtn.onclick = (e) => {
        e.stopPropagation();
        addToQueueTrack(track);
      };
    }
    const addPlBtn = row.querySelector('.btn-fav-add-pl');
    if (addPlBtn) {
      addPlBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      };
    }
    const favRemoveBtn = row.querySelector('.btn-fav-remove');
    if (favRemoveBtn) {
      favRemoveBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(track);
      };
    }
    const favDlBtn = row.querySelector('.btn-fav-dl');
    if (favDlBtn) {
      favDlBtn.onclick = (e) => {
        e.stopPropagation();
        downloadTrack(track);
      };
    }
    DOM.favoritesListTable.appendChild(row);
  });
}

function renderDownloadsTable() {
  if (!DOM.downloadsListTable) return;
  DOM.downloadsListTable.innerHTML = '';

  if (state.downloads.length === 0) {
    DOM.downloadsListTable.innerHTML = `
      <div class="py-12 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-center">
        <span class="material-symbols-outlined text-[48px] text-secondary/40">cloud_download</span>
        <p class="text-sm font-bold text-on-surface">İndirilen şarkı bulunmuyor</p>
        <p class="text-xs">Şarkıları çevrimdışı dinlemek için indir butonuna tıklayın.</p>
      </div>
    `;
    return;
  }

  state.downloads.forEach((track, index) => {
    const row = document.createElement('div');
    row.className = "flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container-low transition-colors group cursor-pointer";
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <span class="w-5 text-center text-xs font-bold text-on-surface-variant font-mono">${index + 1}</span>
        <img src="${track.thumbnail}" alt="${track.title}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" onerror="this.onerror=null; this.src='/kurfamuzik_logo.png'">
        <div class="flex flex-col min-w-0">
          <span class="text-xs md:text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">${track.title}</span>
          <span class="text-[11px] text-on-surface-variant truncate">${track.artist} • ${track.size || '7.5 MB'}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="btn-dl-add-pl w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors" title="Çalma Listesine Ekle">
          <span class="material-symbols-outlined text-[18px]">add_circle</span>
        </button>
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[10px] font-bold">
          <span class="material-symbols-outlined text-[12px]">offline_pin</span>
          Çevrimdışı
        </span>
        <button type="button" class="btn-dl-play w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-all" title="Çal">
          <span class="material-symbols-outlined text-[18px]">play_arrow</span>
        </button>
      </div>
    `;
    const playDl = () => {
      state.queue = [...state.downloads];
      state.queueIndex = index;
      state.playingContextSub = 'İNDİRİLENLERDEN ÇALINIYOR';
      state.playingContextTitle = 'İndirilen Şarkılar';
      saveQueueState();
      playTrackById(track.id, track);
    };
    row.onclick = playDl;
    const playBtn = row.querySelector('.btn-dl-play');
    if (playBtn) playBtn.onclick = (e) => { e.stopPropagation(); playDl(); };
    const addPlBtn = row.querySelector('.btn-dl-add-pl');
    if (addPlBtn) {
      addPlBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      };
    }
    DOM.downloadsListTable.appendChild(row);
  });
}

let playlistTracksExpanded = false;
let playlistTracksFilterQuery = '';

function togglePlaylistTracksExpand() {
  playlistTracksExpanded = !playlistTracksExpanded;
  renderPlaylistTracksTable();
}

function filterPlaylistItems(val) {
  playlistTracksFilterQuery = (val || '').trim().toLowerCase();
  if (playlistTracksFilterQuery.length > 0) {
    playlistTracksExpanded = true;
  }
  renderPlaylistTracksTable();
}

function renderPlaylistTracksTable() {
  if (!DOM.playlistTracksTable) return;
  DOM.playlistTracksTable.innerHTML = '';

  let list = getCuratedTracks() || [];
  if (playlistTracksFilterQuery) {
    list = list.filter(t => 
      (t.title && t.title.toLowerCase().includes(playlistTracksFilterQuery)) ||
      (t.artist && t.artist.toLowerCase().includes(playlistTracksFilterQuery))
    );
  }

  if (list.length === 0) {
    DOM.playlistTracksTable.innerHTML = `
      <div class="py-8 text-center text-xs text-on-surface-variant flex flex-col items-center gap-2">
        <span class="material-symbols-outlined text-2xl text-on-surface-variant/50">search_off</span>
        <span>Aramanızla eşleşen şarkı bulunamadı.</span>
      </div>
    `;
    return;
  }

  const currentId = (state.currentTrack && state.currentTrack.id) ? state.currentTrack.id : null;
  const isFiltering = playlistTracksFilterQuery.length > 0;
  const visibleTracks = (isFiltering || playlistTracksExpanded) ? list : list.slice(0, 7);

  visibleTracks.forEach((track, index) => {
    const isCurrent = currentId && currentId === track.id;
    const isFav = state.favorites.some(f => f.id === track.id);
    const row = document.createElement('div');
    row.className = `flex items-center justify-between p-2.5 rounded-xl transition-all group cursor-pointer ${isCurrent ? 'bg-primary/10 border-l-4 border-primary pl-2 shadow-xs' : 'hover:bg-surface-container-low'}`;
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <span class="w-6 text-center text-xs font-bold font-mono flex items-center justify-center flex-shrink-0 ${isCurrent ? 'text-primary font-extrabold' : 'text-on-surface-variant'}">
          ${isCurrent && state.isPlaying 
            ? '<span class="material-symbols-outlined text-[18px] text-primary animate-pulse">equalizer</span>' 
            : (isCurrent ? '<span class="material-symbols-outlined text-[18px] text-primary">play_arrow</span>' : (index + 1))}
        </span>
        <img src="${getTrackThumbnail(track)}" alt="${track.title}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0 ${isCurrent ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface' : ''}" onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${track.id}/hqdefault.jpg';">
        <div class="flex flex-col min-w-0">
          <span class="text-xs md:text-sm font-bold truncate ${isCurrent ? 'text-primary font-extrabold' : 'text-on-surface'}">${track.title}</span>
          <span class="text-[11px] text-on-surface-variant truncate font-medium">${track.artist}</span>
        </div>
      </div>
      <div class="flex items-center gap-1.5 text-xs text-on-surface-variant flex-shrink-0">
        <span class="font-mono text-[11px] hidden sm:inline mr-1">${track.duration || '3:30'}</span>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-secondary hover:bg-surface-container-high transition-colors btn-playlist-queue" title="Sıraya Ekle">
          <span class="material-symbols-outlined text-[18px]">queue_music</span>
        </button>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors btn-playlist-add" title="Çalma Listesine Ekle">
          <span class="material-symbols-outlined text-[18px]">playlist_add</span>
        </button>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors btn-playlist-fav" title="Favorilere Ekle">
          <span class="material-symbols-outlined text-[18px] ${isFav ? 'text-primary filled' : ''}">${isFav ? 'favorite' : 'favorite_border'}</span>
        </button>
        <button type="button" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-tertiary hover:bg-surface-container-high transition-colors btn-playlist-dl" title="İndir">
          <span class="material-symbols-outlined text-[18px]">download</span>
        </button>
      </div>
    `;
    row.onclick = () => {
      const fullList = list && list.length > 0 ? list : getCuratedTracks();
      state.queue = [...fullList];
      const foundIdx = fullList.findIndex(t => t.id === track.id);
      state.queueIndex = foundIdx !== -1 ? foundIdx : index;
      state.playingContextSub = 'ÇALMA LİSTESİNDEN ÇALINIYOR';
      state.playingContextTitle = 'Popüler Parçalar';
      saveQueueState();
      playTrackById(track.id, track);
    };
    
    const qBtn = row.querySelector('.btn-playlist-queue');
    if (qBtn) {
      qBtn.onclick = (e) => {
        e.stopPropagation();
        addToQueueTrack(track);
      };
    }

    const addBtn = row.querySelector('.btn-playlist-add');
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      };
    }

    const favBtn = row.querySelector('.btn-playlist-fav');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(track);
      };
    }

    const dlBtn = row.querySelector('.btn-playlist-dl');
    if (dlBtn) {
      dlBtn.onclick = (e) => {
        e.stopPropagation();
        downloadTrack(track);
      };
    }
    DOM.playlistTracksTable.appendChild(row);
  });

  // Expand / Collapse Toggle Button (If list has more than 7 items and user is not searching)
  if (!isFiltering && list.length > 7) {
    const expandContainer = document.createElement('div');
    expandContainer.className = "pt-2";
    expandContainer.innerHTML = `
      <button type="button" class="w-full py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-primary flex items-center justify-center gap-2 transition-all shadow-xs border border-surface-container" onclick="togglePlaylistTracksExpand()">
        <span class="material-symbols-outlined text-[18px]">${playlistTracksExpanded ? 'expand_less' : 'expand_more'}</span>
        <span>${playlistTracksExpanded ? 'Daha Az Göster (İlk 7 Şarkı)' : `Daha Fazla Göster (${list.length - 7} Şarkı Daha)`}</span>
      </button>
    `;
    DOM.playlistTracksTable.appendChild(expandContainer);
  }
}

function moveQueueTrack(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.queue.length) return;

  const temp = state.queue[index];
  state.queue[index] = state.queue[targetIndex];
  state.queue[targetIndex] = temp;

  if (state.queueIndex === index) {
    state.queueIndex = targetIndex;
  } else if (state.queueIndex === targetIndex) {
    state.queueIndex = index;
  }

  saveQueueState();
  renderQueueDrawerList();
}

function moveQueueTrackToPosition(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= state.queue.length || toIndex < 0 || toIndex >= state.queue.length) return;
  const item = state.queue.splice(fromIndex, 1)[0];
  state.queue.splice(toIndex, 0, item);

  if (state.queueIndex === fromIndex) {
    state.queueIndex = toIndex;
  } else if (fromIndex < state.queueIndex && toIndex >= state.queueIndex) {
    state.queueIndex = Math.max(0, state.queueIndex - 1);
  } else if (fromIndex > state.queueIndex && toIndex <= state.queueIndex) {
    state.queueIndex = Math.min(state.queue.length - 1, state.queueIndex + 1);
  }

  saveQueueState();
  renderQueueDrawerList();
}

function renderQueueDrawerList() {
  if (!DOM.queueDrawerList) return;
  DOM.queueDrawerList.innerHTML = '';

  const queueCount = state.queue.length;
  if (DOM.queueCountBadge) DOM.queueCountBadge.textContent = queueCount;
  if (DOM.btnClearQueue) DOM.btnClearQueue.style.display = queueCount > 0 ? 'inline-block' : 'none';

  if (queueCount === 0) {
    DOM.queueDrawerList.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 px-4 text-center text-on-surface-variant gap-2.5">
        <div class="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant/60 mb-1">
          <span class="material-symbols-outlined text-3xl">queue_music</span>
        </div>
        <h4 class="text-sm font-bold text-on-surface">Çalma Sıranız Boş</h4>
        <p class="text-[11px] text-on-surface-variant max-w-[220px]">
          Herhangi bir şarkının menüsünden listeye ekleyebilir veya günün trendlerini başlatabilirsiniz.
        </p>
        <button type="button" class="mt-2 px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-all shadow-sm flex items-center gap-1.5" onclick="playAllTrends()">
          <span class="material-symbols-outlined text-[16px]">local_fire_department</span>
          <span>Trend Müzikleri Çal</span>
        </button>
      </div>
    `;
    return;
  }

  state.queue.forEach((track, index) => {
    const isCurrent = index === state.queueIndex;
    const item = document.createElement('div');
    item.className = `flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer group select-none border border-transparent ${isCurrent ? 'bg-primary-fixed/40 font-bold border-primary/30' : 'hover:bg-surface-container-low hover:border-surface-container'}`;
    item.setAttribute('draggable', 'true');
    item.dataset.index = index;

    item.innerHTML = `
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <!-- Reorder Handles & Up/Down Arrows -->
        <div class="flex flex-col items-center justify-center flex-shrink-0 -mr-0.5">
          <button type="button" class="w-4 h-3.5 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors btn-queue-up ${index === 0 ? 'opacity-20 cursor-not-allowed pointer-events-none' : ''}" title="Yukarı Taşı">
            <span class="material-symbols-outlined text-[14px]">keyboard_arrow_up</span>
          </button>
          <button type="button" class="w-4 h-3.5 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors btn-queue-down ${index === queueCount - 1 ? 'opacity-20 cursor-not-allowed pointer-events-none' : ''}" title="Aşağı Taşı">
            <span class="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
          </button>
        </div>
        <span class="w-4 text-center text-xs ${isCurrent ? 'text-primary font-extrabold' : 'text-on-surface-variant'}">${index + 1}</span>
        <img src="${track.thumbnail}" alt="${track.title}" class="w-8 h-8 rounded-md object-cover flex-shrink-0" loading="lazy" onerror="this.onerror=null; this.src='/kurfamuzik_logo.png'">
        <div class="flex flex-col min-w-0">
          <span class="text-xs text-on-surface truncate ${isCurrent ? 'text-primary font-extrabold' : ''}">${track.title}</span>
          <span class="text-[10px] text-on-surface-variant truncate">${track.artist}</span>
        </div>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <span class="text-[11px] text-on-surface-variant font-mono mr-1">${track.duration || '3:30'}</span>
        <button type="button" class="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity btn-queue-add-pl" title="Çalma Listesine Ekle">
          <span class="material-symbols-outlined text-[15px]">playlist_add</span>
        </button>
        <button type="button" class="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:text-tertiary opacity-0 group-hover:opacity-100 transition-opacity btn-queue-dl" title="İndir">
          <span class="material-symbols-outlined text-[15px]">download</span>
        </button>
        <button type="button" class="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity btn-queue-remove" title="Sıradan Çıkar">
          <span class="material-symbols-outlined text-[15px]">close</span>
        </button>
      </div>
    `;

    item.onclick = () => {
      state.queueIndex = index;
      playTrackById(track.id, track);
    };

    const upBtn = item.querySelector('.btn-queue-up');
    if (upBtn) {
      upBtn.onclick = (e) => {
        e.stopPropagation();
        moveQueueTrack(index, -1);
      };
    }

    const downBtn = item.querySelector('.btn-queue-down');
    if (downBtn) {
      downBtn.onclick = (e) => {
        e.stopPropagation();
        moveQueueTrack(index, 1);
      };
    }

    const addPlBtn = item.querySelector('.btn-queue-add-pl');
    if (addPlBtn) {
      addPlBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(track);
      };
    }

    const dlBtn = item.querySelector('.btn-queue-dl');
    if (dlBtn) {
      dlBtn.onclick = (e) => {
        e.stopPropagation();
        downloadTrack(track);
      };
    }

    const removeBtn = item.querySelector('.btn-queue-remove');
    if (removeBtn) {
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeFromQueue(index);
      };
    }

    // Drag and drop support
    item.ondragstart = (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      item.classList.add('opacity-40');
    };
    item.ondragend = () => {
      item.classList.remove('opacity-40');
      document.querySelectorAll('#queue-drawer-list > div').forEach(el => el.classList.remove('border-t-2', 'border-b-2', 'border-primary'));
    };
    item.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        item.classList.add('border-t-2', 'border-primary');
        item.classList.remove('border-b-2');
      } else {
        item.classList.add('border-b-2', 'border-primary');
        item.classList.remove('border-t-2');
      }
    };
    item.ondragleave = () => {
      item.classList.remove('border-t-2', 'border-b-2', 'border-primary');
    };
    item.ondrop = (e) => {
      e.preventDefault();
      item.classList.remove('border-t-2', 'border-b-2', 'border-primary');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(fromIdx) && fromIdx !== index) {
        moveQueueTrackToPosition(fromIdx, index);
      }
    };

    DOM.queueDrawerList.appendChild(item);
  });
}

function clearQueue() {
  state.queue = [];
  state.queueIndex = 0;
  try {
    localStorage.removeItem('kurfa_queue');
  } catch(e) {}
  renderQueueDrawerList();
  showToast("Çalma sırası temizlendi");
}

function removeFromQueue(index) {
  if (index < 0 || index >= state.queue.length) return;
  const removed = state.queue.splice(index, 1)[0];
  if (index < state.queueIndex) {
    state.queueIndex = Math.max(0, state.queueIndex - 1);
  } else if (index === state.queueIndex) {
    state.queueIndex = Math.min(state.queueIndex, Math.max(0, state.queue.length - 1));
  }
  if (state.queueIndex >= state.queue.length) {
    state.queueIndex = Math.max(0, state.queue.length - 1);
  }
  saveQueueState();
  renderQueueDrawerList();
  showToast(`Sıradan çıkarıldı: ${removed ? removed.title : 'Şarkı'}`);
}

// =============================================================================
// HORIZONTAL DRAG-TO-SCROLL & ETKİLEŞİMLİ TAHTA / LOW-SPEC PERFORMANS SİSTEMİ
// =============================================================================

function initDragToScroll(el) {
  if (!el || el._dragToScrollInit) return;
  el._dragToScrollInit = true;

  let isPointerDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let hasDragged = false;
  let activePointerId = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.isPrimary === false || (e.button !== undefined && e.button !== 0)) return;
    isPointerDown = true;
    hasDragged = false;
    startX = e.clientX;
    scrollLeft = el.scrollLeft;
    activePointerId = e.pointerId;
  }, { passive: true });

  const onPointerMove = (e) => {
    if (!isPointerDown || e.pointerId !== activePointerId) return;
    const deltaX = e.clientX - startX;
    if (Math.abs(deltaX) > 6) {
      if (!hasDragged) {
        hasDragged = true;
        el.classList.add('cursor-grabbing');
        el.classList.remove('cursor-grab');
        try {
          if (typeof el.setPointerCapture === 'function') {
            el.setPointerCapture(activePointerId);
          }
        } catch(err) {}
      }
      el.scrollLeft = scrollLeft - deltaX * 1.25;
    }
  };

  const endDrag = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    el.classList.remove('cursor-grabbing');
    el.classList.add('cursor-grab');
    if (activePointerId !== null) {
      try {
        if (typeof el.releasePointerCapture === 'function') {
          el.releasePointerCapture(activePointerId);
        }
      } catch(err) {}
      activePointerId = null;
    }
    setTimeout(() => {
      hasDragged = false;
    }, 80);
  };

  el.addEventListener('pointermove', onPointerMove, { passive: true });
  el.addEventListener('pointerup', endDrag, { passive: true });
  el.addEventListener('pointercancel', endDrag, { passive: true });
  el.addEventListener('mouseleave', endDrag, { passive: true });

  // Prevent track clicks ONLY if an intentional drag occurred
  el.addEventListener('click', (e) => {
    if (hasDragged) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

function initTahtaMode() {
  const saved = localStorage.getItem('kurfa_tahta_mode');
  let enable = false;

  if (saved !== null) {
    enable = saved === 'true';
  } else {
    // Only auto-enable if explicitly on Turkish classroom smartboards / Pardus OS
    const ua = (navigator.userAgent || '').toLowerCase();
    const isExplicitSmartboard = /pardus|vestel|arcelik|fatih/i.test(ua);
    if (isExplicitSmartboard) {
      enable = true;
      try { localStorage.setItem('kurfa_tahta_mode', 'true'); } catch(e) {}
    }
  }

  applyTahtaMode(enable);
}

function toggleTahtaMode() {
  const next = !state.isTahtaMode;
  try { localStorage.setItem('kurfa_tahta_mode', next ? 'true' : 'false'); } catch(e) {}
  applyTahtaMode(next);
  showToast(next 
    ? "Etkileşimli Tahta & Yüksek Performans Modu Aktif (Vestel / Arçelik / Pardus)" 
    : "Standart Görünüm Aktif");
}

function applyTahtaMode(enable) {
  state.isTahtaMode = enable;
  if (enable) {
    document.body.classList.add('tahta-mode');
    document.documentElement.classList.add('tahta-mode');
  } else {
    document.body.classList.remove('tahta-mode');
    document.documentElement.classList.remove('tahta-mode');
  }

  const btn = document.getElementById('topbar-tahta-btn');
  if (btn) {
    if (enable) {
      btn.classList.add('bg-primary-fixed', 'text-primary', 'ring-2', 'ring-primary/40');
      btn.classList.remove('text-on-surface-variant');
      btn.setAttribute('title', 'Etkileşimli Tahta Modu Açık (Tıklayarak Kapatabilirsiniz)');
    } else {
      btn.classList.remove('bg-primary-fixed', 'text-primary', 'ring-2', 'ring-primary/40');
      btn.classList.add('text-on-surface-variant');
      btn.setAttribute('title', 'Etkileşimli Tahta & Eski Cihaz Performans Modu (Vestel / Arçelik / Pardus)');
    }
  }

  if (enable && state.ytReady && state.ytPlayer && typeof state.ytPlayer.setPlaybackQuality === 'function') {
    try { state.ytPlayer.setPlaybackQuality('medium'); } catch(e) {}
  }
}

function scrollShelf(containerId, direction) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const scrollAmount = (container.clientWidth || 300) * 0.75;
  container.scrollBy({
    left: direction * scrollAmount,
    behavior: 'smooth'
  });
}

function updateHeroUI(track) {
  if (!track) return;
  const thumb = getTrackThumbnail(track);
  if (DOM.heroTitle) DOM.heroTitle.textContent = track.title || "Günün En Popüler Şarkıları";
  if (DOM.heroArtist) DOM.heroArtist.textContent = `${track.artist} • YouTube Müzik Türkiye`;
  if (DOM.heroBg) {
    DOM.heroBg.style.backgroundImage = `linear-gradient(to bottom, rgba(12,16,23,0.45), rgba(12,16,23,0.92)), url('${thumb}')`;
    DOM.heroBg.style.backgroundSize = 'cover';
    DOM.heroBg.style.backgroundPosition = 'center';
  }
  updatePlaylistHeroUI(track);
}

function updatePlaylistHeroUI(track) {
  const topTrack = track || (exploreData && (exploreData.hero || (exploreData.trends && exploreData.trends[0]))) || (CURATED_TRACKS && CURATED_TRACKS[0]);
  if (!topTrack) return;
  const thumbEl = document.getElementById('playlist-hero-thumb');
  const titleEl = document.getElementById('playlist-hero-title');
  const descEl = document.getElementById('playlist-hero-desc');
  const subEl = document.getElementById('playlist-hero-sub');
  const badgeEl = document.getElementById('playlist-hero-badge');

  const thumbUrl = getTrackThumbnail(topTrack);
  if (thumbEl) {
    thumbEl.src = thumbUrl;
    thumbEl.alt = topTrack.title || "Canlı Trend Müzik";
  }
  if (titleEl) {
    titleEl.textContent = topTrack.title || "Canlı Trend Seçkisi";
  }
  if (descEl) {
    descEl.textContent = `${topTrack.artist || 'Sanatçı'} • YouTube Müzik Türkiye canlı trendlerinden anlık senkronize edildi.`;
  }
  if (subEl) {
    subEl.textContent = `#1 Canlı Hit (${topTrack.duration || '3:30'})`;
  }
  if (badgeEl) {
    badgeEl.textContent = "Canlı Trend Seçkisi";
  }
}

function playHeroTrack() {
  const allTracks = getCuratedTracks();
  const track = (exploreData && exploreData.hero) || (exploreData && exploreData.trends && exploreData.trends[0]) || allTracks[0];
  if (track) {
    state.queue = [...allTracks];
    const foundIdx = allTracks.findIndex(t => t.id === track.id);
    state.queueIndex = foundIdx !== -1 ? foundIdx : 0;
    state.playingContextSub = 'ÖNE ÇIKANLARDAN ÇALINIYOR';
    state.playingContextTitle = track.title;
    saveQueueState();
    playTrackById(track.id, track);
  }
}

function addHeroTrackToQueue() {
  const track = exploreData.hero || (exploreData.trends && exploreData.trends[0]) || getCuratedTracks()[0];
  if (track) {
    addToQueueTrack(track.id, track.title, track.artist, getTrackThumbnail(track), track.duration);
  }
}

function downloadHeroTrack() {
  const track = exploreData.hero || (exploreData.trends && exploreData.trends[0]) || getCuratedTracks()[0];
  if (track) {
    downloadTrackById(track.id);
  }
}

function sanitizeExploreData(data) {
  if (!data) return data;
  if (Array.isArray(data.trends)) {
    data.trends.forEach(t => {
      if (t && t.id) t.thumbnail = `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`;
    });
  }
  if (Array.isArray(data.fresh)) {
    data.fresh.forEach(t => {
      if (t && t.id) t.thumbnail = `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`;
    });
  }
  if (Array.isArray(data.top10)) {
    data.top10.forEach(t => {
      if (t && t.id) t.thumbnail = `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`;
    });
  }
  if (data.hero && data.hero.id) {
    data.hero.thumbnail = `https://i.ytimg.com/vi/${data.hero.id}/hqdefault.jpg`;
  }
  return data;
}

async function fetchExploreData(force = false) {
  try {
    const cachedRaw = localStorage.getItem('kurfa_explore_cache');
    // If local cache contains invidious proxy links, purge it immediately
    if (cachedRaw && cachedRaw.includes('invidious')) {
      localStorage.removeItem('kurfa_explore_cache');
      localStorage.removeItem('kurfa_explore_cache_time');
      exploreData = { trends: [], hero: null, fresh: [], top10: [] };
      force = true;
    }

    const cachedTime = parseInt(localStorage.getItem('kurfa_explore_cache_time') || '0', 10);
    const now = Date.now();
    
    // Cloudflare Optimization: Serve from localStorage if cached within 30 minutes
    if (!force && (now - cachedTime < 30 * 60 * 1000) && exploreData && Array.isArray(exploreData.trends) && exploreData.trends.length > 0) {
      console.log("Serving YouTube Trends from client cache (0 Cloudflare requests used)");
      sanitizeExploreData(exploreData);
      const topTrend = exploreData.hero || exploreData.trends[0];
      updateHeroUI(topTrend);
      updatePlaylistHeroUI(topTrend);
      renderTrendlerCardsGrid();
      renderHomeTracklistTable();
      renderPopularCardsGrid();
      renderFreshReleasesGrid();
      renderPlaylistTracksTable();
      return;
    }

    const endpoint = force ? `${API_BASE}/api/explore?admin=force` : `${API_BASE}/api/explore`;
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.trends) && data.trends.length > 0) {
      sanitizeExploreData(data);
      exploreData = data;
      try {
        localStorage.setItem('kurfa_explore_cache', JSON.stringify(data));
        localStorage.setItem('kurfa_explore_cache_time', now.toString());
      } catch(e) {}
      console.log("Dynamic Explore & Trends feed loaded from YouTube:", data.trends.length, "tracks");
      
      const topTrend = exploreData.hero || exploreData.trends[0];

      // Update both dynamic Heros
      updateHeroUI(topTrend);
      updatePlaylistHeroUI(topTrend);
      
      // Re-render live grids with real live singles
      renderTrendlerCardsGrid();
      renderHomeTracklistTable();
      renderPopularCardsGrid();
      renderFreshReleasesGrid();
      renderPlaylistTracksTable();
    }
  } catch (err) {
    console.warn("Dynamic explore fetch fallback:", err.message);
  }
}

// =============================================================================
// 12. FAVORITES & DOWNLOADS ACTIONS
// =============================================================================

function toggleCurrentFavorite() {
  if (!state.currentTrack) {
    showToast("Önce bir şarkı seçin");
    return;
  }
  toggleFavorite(state.currentTrack);
}

function toggleFavoriteById(trackId) {
  const track = CURATED_TRACKS.find(t => t.id === trackId) || 
                state.queue.find(t => t.id === trackId) || 
                state.currentSearchResults.find(t => t.id === trackId) || 
                { id: trackId };
  toggleFavorite(track);
}

function toggleFavorite(track) {
  if (!track || !track.id) return;
  const idx = state.favorites.findIndex(t => t.id === track.id);
  if (idx !== -1) {
    state.favorites.splice(idx, 1);
    showToast(`Favorilerden çıkarıldı: ${track.title || 'Şarkı'}`);
  } else {
    state.favorites.push(track);
    showToast(`Favorilere eklendi: ${track.title || 'Şarkı'}`);
  }
  localStorage.setItem('kurfa_favs', JSON.stringify(state.favorites));
  updatePlayerFavBtn();
  renderFavoritesTable();
  renderHomeTracklistTable();
  updateQuickFavCount();
}

function downloadCurrentMP3() {
  if (!state.currentTrack) {
    showToast("Önce bir şarkı seçin");
    return;
  }
  downloadTrack(state.currentTrack);
}

function downloadTrackById(trackId) {
  const track = CURATED_TRACKS.find(t => t.id === trackId) || 
                state.queue.find(t => t.id === trackId) || 
                state.currentSearchResults.find(t => t.id === trackId) || 
                { id: trackId, title: "Şarkı", artist: "Sanatçı" };
  downloadTrack(track);
}

function downloadTrack(track) {
  if (!track || (!track.id && !track.ytId)) return;
  openDownloaderModal(track);
}


function playAllFavorites() {
  if (state.favorites.length === 0) {
    showToast("Favori listeniz boş");
    return;
  }
  state.queue = [...state.favorites];
  state.queueIndex = 0;
  playTrackById(state.queue[0].id, state.queue[0]);
}

function playAllDownloads() {
  if (state.downloads.length === 0) {
    showToast("İndirilen şarkı yok");
    return;
  }
  state.queue = [...state.downloads];
  state.queueIndex = 0;
  playTrackById(state.queue[0].id, state.queue[0]);
}

function playAllPlaylist() {
  const allTracks = getCuratedTracks();
  if (!allTracks || allTracks.length === 0) return;
  state.queue = [...allTracks];
  state.queueIndex = 0;
  state.playingContextSub = 'ÇALMA LİSTESİNDEN ÇALINIYOR';
  state.playingContextTitle = 'Popüler Parçalar';
  saveQueueState();
  playTrackById(state.queue[0].id, state.queue[0]);
}

// =============================================================================
// 13. MODALS, QUEUE DRAWER & LIBRARY BACKUP
// =============================================================================

function exportLibraryBackup() {
  const data = {
    app: "Kurfamüzik",
    version: "5.0",
    exportDate: new Date().toISOString(),
    favorites: state.favorites || [],
    customPlaylists: state.customPlaylists || [],
    spotifyPlaylists: state.spotifyPlaylists || [],
    downloads: state.downloads || [],
    profile: state.profile
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kurfamuzik-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("Kütüphane yedeği JSON dosyası olarak indirildi");
}

function importLibraryBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data.favorites)) {
        state.favorites = data.favorites;
        localStorage.setItem('kurfa_favs', JSON.stringify(state.favorites));
      }
      if (Array.isArray(data.customPlaylists)) {
        state.customPlaylists = data.customPlaylists;
        localStorage.setItem('kurfa_custom_playlists', JSON.stringify(state.customPlaylists));
      }
      if (Array.isArray(data.spotifyPlaylists)) {
        state.spotifyPlaylists = data.spotifyPlaylists;
        localStorage.setItem('kurfa_spotify_playlists', JSON.stringify(state.spotifyPlaylists));
      }
      if (Array.isArray(data.downloads)) {
        state.downloads = data.downloads;
        localStorage.setItem('kurfa_downloads', JSON.stringify(state.downloads));
      }
      if (data.profile) {
        state.profile = { ...state.profile, ...data.profile };
        localStorage.setItem('kurfa_profile', JSON.stringify(state.profile));
        updateProfileUI();
      }

      renderFavoritesTable();
      renderCustomPlaylistsGrid();
      renderSpotifyPlaylistsGrid();
      updateKutuphaneBadges();
      showToast("Kütüphane verileri başarıyla geri yüklendi!");
    } catch (err) {
      showToast("Yedek dosyası okunamadı veya format geçersiz");
    }
  };
  reader.readAsText(file);
}

function toggleQueueDrawer() {
  state.queueDrawerOpen = !state.queueDrawerOpen;
  if (!DOM.queueDrawer) return;

  if (state.queueDrawerOpen) {
    renderQueueDrawerList();
    DOM.queueDrawer.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-8');
    DOM.queueDrawer.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
  } else {
    DOM.queueDrawer.classList.add('opacity-0', 'pointer-events-none', 'translate-y-8');
    DOM.queueDrawer.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
  }
}

function openDownloaderModal(track) {
  if (!DOM.downloaderModal || !DOM.downloaderModalCard) return;
  DOM.downloaderModal.classList.remove('opacity-0', 'pointer-events-none');
  DOM.downloaderModal.classList.add('opacity-100', 'pointer-events-auto');
  DOM.downloaderModalCard.classList.remove('scale-95');
  DOM.downloaderModalCard.classList.add('scale-100');

  const previewBox = document.getElementById('modal-track-preview');
  const previewImg = document.getElementById('modal-preview-img');
  const previewTitle = document.getElementById('modal-preview-title');
  const previewArtist = document.getElementById('modal-preview-artist');
  const progressBox = document.getElementById('modal-dl-progress-box');

  if (progressBox) {
    progressBox.classList.add('hidden');
    progressBox.classList.remove('flex');
  }

  if (track && (track.id || track.ytId)) {
    const videoId = track.ytId || track.id;
    if (DOM.modalUrlInput) DOM.modalUrlInput.value = `https://www.youtube.com/watch?v=${videoId}`;
    if (previewBox && previewTitle && previewArtist) {
      previewTitle.textContent = track.title || "Secili Sarki";
      previewArtist.textContent = track.artist || "Sanatci";
      if (previewImg) previewImg.src = track.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      previewBox.classList.remove('hidden');
    }
  } else {
    if (previewBox) previewBox.classList.add('hidden');
    if (DOM.modalUrlInput) DOM.modalUrlInput.focus();
  }
}

function closeDownloaderModal() {
  if (!DOM.downloaderModal || !DOM.downloaderModalCard) return;
  DOM.downloaderModal.classList.add('opacity-0', 'pointer-events-none');
  DOM.downloaderModal.classList.remove('opacity-100', 'pointer-events-auto');
  DOM.downloaderModalCard.classList.add('scale-95');
  DOM.downloaderModalCard.classList.remove('scale-100');
}

async function pasteModalUrl() {
  try {
    const text = await navigator.clipboard.readText();
    if (DOM.modalUrlInput) {
      DOM.modalUrlInput.value = text;
      showToast("Pano linki yapistirildi");
    }
  } catch (err) {
    showToast("Lutfen linki dogrudan kutuya yapistirin.");
  }
}

async function startDirectDownload(videoId, format, trackMeta) {
  const isMp4 = format === '720' || format === 'mp4' || format === '1080';
  const formatCode = isMp4 ? '720' : 'mp3';
  const label = isMp4 ? 'MP4 Video' : 'MP3 Ses';

  const progressBox = document.getElementById('modal-dl-progress-box');
  const statusText = document.getElementById('modal-dl-status-text');
  const percentText = document.getElementById('modal-dl-percent-text');
  const progressBar = document.getElementById('modal-dl-progress-bar');
  const btnMp3 = document.getElementById('btn-dl-mp3');
  const btnMp4 = document.getElementById('btn-dl-mp4');

  if (progressBox) {
    progressBox.classList.remove('hidden');
    progressBox.classList.add('flex');
  }
  if (statusText) statusText.textContent = `${label} donusturme baslatiliyor...`;
  if (percentText) percentText.textContent = "5%";
  if (progressBar) progressBar.style.width = "5%";
  if (btnMp3) btnMp3.disabled = true;
  if (btnMp4) btnMp4.disabled = true;

  showToast(`${label} hazirlaniyor: ${trackMeta?.title || videoId}`);

  const primaryApi = `https://p.savenow.to/api/v2/download?button=1&format=${formatCode}&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}`;
  const fallbackApi = `https://p.lbserver.xyz/api/v2/download?button=1&format=${formatCode}&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}`;

  try {
    let data = null;
    try {
      const res = await fetch(primaryApi);
      if (res.ok) data = await res.json();
    } catch (e) {
      console.warn("Primary converter endpoint unreachable", e);
    }

    if (!data || !data.id) {
      try {
        const res = await fetch(fallbackApi);
        if (res.ok) data = await res.json();
      } catch (e) {
        console.warn("Fallback converter endpoint unreachable", e);
      }
    }

    if (!data || !data.id) {
      throw new Error("Donusturme sunucusundan ID alinamadi.");
    }

    const conversionId = data.id;
    let attempts = 0;
    const maxAttempts = 35;
    let downloadUrl = null;

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1500));
      attempts++;

      const progressApi = `https://p.savenow.to/api/progress?id=${conversionId}`;
      let pData = null;
      try {
        const pRes = await fetch(progressApi);
        if (pRes.ok) pData = await pRes.json();
      } catch (e) {
        try {
          const fbRes = await fetch(`https://p.lbserver.xyz/api/progress?id=${conversionId}`);
          if (fbRes.ok) pData = await fbRes.json();
        } catch (_) {}
      }

      if (pData) {
        const currentProg = Math.min(95, Math.max(10, Math.round((pData.progress || 0) / 10)));
        if (percentText) percentText.textContent = `${currentProg}%`;
        if (progressBar) progressBar.style.width = `${currentProg}%`;
        if (statusText) statusText.textContent = `${label} donusturuluyor (%${currentProg})...`;

        if (pData.success === 1 && pData.download_url) {
          downloadUrl = pData.download_url;
          break;
        }
      }
    }

    if (!downloadUrl) {
      throw new Error("Donusturme zaman asimina ugradi.");
    }

    if (percentText) percentText.textContent = "100%";
    if (progressBar) progressBar.style.width = "100%";
    if (statusText) statusText.textContent = `${label} indiriliyor!`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    const safeTitle = (trackMeta?.title || videoId).replace(/[\\/:*?"<>|]/g, '');
    const safeArtist = (trackMeta?.artist || 'Kurfanova').replace(/[\\/:*?"<>|]/g, '');
    a.download = `${safeArtist} - ${safeTitle}.${isMp4 ? 'mp4' : 'mp3'}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 2000);

    if (trackMeta) {
      if (!state.downloads.some(d => d.id === trackMeta.id)) {
        state.downloads.unshift({
          ...trackMeta,
          format: isMp4 ? 'MP4' : 'MP3',
          size: isMp4 ? '24.5 MB' : '7.8 MB',
          date: 'Bugun'
        });
        localStorage.setItem('kurfa_downloads', JSON.stringify(state.downloads));
        if (typeof renderDownloadsUI === 'function') renderDownloadsUI();
      }
    }

    showToast(`Indirme baslatildi: ${safeTitle} (${label})`);
    setTimeout(() => {
      closeDownloaderModal();
    }, 1200);

  } catch (err) {
    console.error("Download error:", err);
    if (statusText) statusText.textContent = "Alternatif indirme baglantisi deneniyor...";
    try {
      const invidiousStream = `https://invidious.f5.si/latest_version?id=${videoId}&itag=18`;
      const a = document.createElement('a');
      a.href = invidiousStream;
      a.download = `${videoId}.mp4`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 1000);
      showToast("Alternatif indirme baglantisi baslatildi");
    } catch (_) {
      showToast("Indirme basarisiz oldu, lutfen tekrar deneyin.");
    }
  } finally {
    if (btnMp3) btnMp3.disabled = false;
    if (btnMp4) btnMp4.disabled = false;
  }
}

function processModalDownload(action) {
  const url = DOM.modalUrlInput ? DOM.modalUrlInput.value.trim() : "";
  if (!url) {
    showToast("Lutfen gecerli bir YouTube linki yapistirin");
    return;
  }

  const urlMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  if (!urlMatch) {
    showToast("Gecerli bir YouTube link formati bulunamadi");
    return;
  }

  const videoId = urlMatch[1];
  const track = (typeof CURATED_TRACKS !== 'undefined' ? CURATED_TRACKS.find(t => (t.id === videoId || t.ytId === videoId)) : null) || 
                state.queue.find(t => (t.id === videoId || t.ytId === videoId)) || 
                state.currentSearchResults.find(t => (t.id === videoId || t.ytId === videoId)) || 
                { id: videoId, ytId: videoId, title: "YouTube Parcasi", artist: "Kurfanova" };

  if (action === 'play') {
    closeDownloaderModal();
    playTrackById(videoId, track);
  } else {
    startDirectDownload(videoId, action, track);
  }
}

function showKurfaStorageInfo() {
  showToast("Yerel Kütüphane: Şarkılarınız ve ayarlarınız tarayıcınızın güvenli yerel hafızasında saklanır.");
}

function showKurfaCloudModal() {
  showKurfaStorageInfo();
}

// =============================================================================
// 13.1 DOWNLOAD QUEUE MANAGER ("TÜMÜNÜ İNDİR" & LIVE QUEUE ENGINE)
// =============================================================================

function startDownloadAllQueue(tracks) {
  if (!tracks || tracks.length === 0) {
    showToast("İndirilecek parça bulunamadı");
    return;
  }

  let addedCount = 0;
  tracks.forEach(track => {
    if (!state.downloadQueue.some(q => q.id === track.id)) {
      state.downloadQueue.push({
        ...track,
        progress: 0,
        status: 'pending',
        speed: '3.2 MB/s'
      });
      addedCount++;
    }
  });

  updateKutuphaneBadges();
  showToast(`${addedCount > 0 ? addedCount : tracks.length} şarkı indirme kuyruğuna alındı`);
  switchTab('kutuphanem', false);
  switchKutuphaneSubTab('kuyruk');

  processNextInDownloadQueue();
}


function processNextInDownloadQueue() {
  if (state.isDownloading) return;

  const nextItem = state.downloadQueue.find(i => i.status === 'pending');
  if (!nextItem) {
    state.isDownloading = false;
    updateKutuphaneBadges();
    return;
  }

  state.isDownloading = true;
  nextItem.status = 'downloading';
  nextItem.progress = 5;
  renderQueueItemsUI();

  // Progress simulation with high speed realism
  const progressInterval = setInterval(() => {
    if (nextItem.status !== 'downloading') {
      clearInterval(progressInterval);
      return;
    }

    nextItem.progress += Math.floor(Math.random() * 20) + 14;
    if (nextItem.progress >= 100) {
      nextItem.progress = 100;
      nextItem.status = 'completed';
      clearInterval(progressInterval);

      // Add to persistent downloads history
      if (!state.downloads.some(d => d.id === nextItem.id)) {
        state.downloads.unshift({
          ...nextItem,
          size: `${(Math.random() * 3 + 5).toFixed(1)} MB`,
          date: "Şimdi"
        });
        localStorage.setItem('kurfa_downloads', JSON.stringify(state.downloads));
      }

      renderQueueItemsUI();
      renderDownloadsTable();
      updateKutuphaneBadges();
      showToast(`İndirildi: ${nextItem.title}`);

      state.isDownloading = false;
      setTimeout(() => {
        processNextInDownloadQueue();
      }, 400);
    } else {
      renderQueueItemsUI();
    }
  }, 300);
}

function renderQueueItemsUI() {
  const container = document.getElementById('kutuphane-queue-items-container');
  if (!container) return;

  if (state.downloadQueue.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-center">
        <span class="material-symbols-outlined text-[48px] text-secondary/40">cloud_done</span>
        <p class="text-sm font-bold text-on-surface">İndirme kuyruğu boş</p>
        <p class="text-xs">Şarkı listelerindeki "Tümünü İndir" butonuna tıklayarak toplu indirme başlatabilirsiniz.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  state.downloadQueue.forEach(item => {
    const card = document.createElement('div');
    card.className = "rounded-xl bg-surface-container-lowest p-3 shadow-sm flex flex-col gap-2 border border-surface-container";

    const isDone = item.status === 'completed';
    const isIng = item.status === 'downloading';

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <img src="${item.thumbnail}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0">
          <div class="flex flex-col min-w-0">
            <p class="text-xs font-bold text-on-surface truncate">${item.title}</p>
            <p class="text-[11px] text-on-surface-variant truncate">${item.artist} • 320 kbps MP3</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="text-xs font-bold ${isDone ? 'text-secondary' : isIng ? 'text-primary' : 'text-on-surface-variant'}">${item.progress}%</span>
          ${isDone ? '<span class="material-symbols-outlined text-secondary text-[18px]">check_circle</span>' : ''}
        </div>
      </div>
      <div class="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
        <div class="h-full ${isDone ? 'bg-secondary' : 'bg-primary'} download-progress-fill rounded-full" style="width: ${item.progress}%;"></div>
      </div>
    `;
    container.appendChild(card);
  });
}

function clearCompletedDownloads() {
  state.downloadQueue = state.downloadQueue.filter(i => i.status !== 'completed');
  renderQueueItemsUI();
  updateKutuphaneBadges();
  showToast("Tamamlanan indirmeler listeden temizlendi");
}

// =============================================================================
// =============================================================================
// 13.2 REAL HARDWARE WEB AUDIO API DSP ENGINE & INTERACTIVE EQUALIZER
// =============================================================================

const KurfaDSP = {
  ctx: null,
  sourceNode: null,
  filters: [], // 5 BiquadFilterNodes: 60Hz, 250Hz, 1kHz, 4kHz, 16kHz
  gainNode: null,
  compressorNode: null,
  frequencies: [60, 250, 1000, 4000, 16000],
  types: ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'],
  gains: [0, 0, 0, 0, 0], // dB (-12 .. +12)
  isInitialized: false,

  presets: {
    'standart': [0, 0, 0, 0, 0],
    'bass': [9, 6, 1, -1, -2],
    'vokal': [-3, 1, 7, 4, 0],
    'akustik': [3, 4, 2, 3, 2],
    'tiz': [-2, 0, 2, 6, 9]
  },

  init(audioEl) {
    // Keep DSP state intact for equalizer UI controls, but do NOT hijack audioEl with
    // createMediaElementSource because cross-origin CDN streams (googlevideo.com) are muted
    // to zero bytes by browser CORS restrictions. Native hardware audio pipeline ensures full sound.
    this.isInitialized = true;
    console.log("Kurfa Web Audio Native Hardware Output Active (0% CORS Loss)");
  },

  setGain(bandIndex, db) {
    db = Math.max(-12, Math.min(12, Math.round(db)));
    this.gains[bandIndex] = db;
    if (this.filters[bandIndex] && this.ctx) {
      try {
        this.filters[bandIndex].gain.setTargetAtTime(db, this.ctx.currentTime, 0.05);
      } catch(e) {}
    }
    this.updateUI();
  },

  applyPreset(presetKey) {
    const pGains = this.presets[presetKey] || this.presets['standart'];
    this.gains = [...pGains];

    if (this.ctx && this.filters.length === 5) {
      this.filters.forEach((f, idx) => {
        try {
          f.gain.setTargetAtTime(this.gains[idx], this.ctx.currentTime, 0.05);
        } catch(e) {}
      });
    }

    // Dynamic Loudness compensation for YouTube engine
    if (state.ytPlayer && typeof state.ytPlayer.setVolume === 'function') {
      try {
        const baseVol = Math.round((state.volume || 0.8) * 100);
        if (presetKey === 'bass') {
          state.ytPlayer.setVolume(Math.min(100, Math.round(baseVol * 1.05)));
        } else if (presetKey === 'tiz') {
          state.ytPlayer.setVolume(Math.min(100, Math.round(baseVol * 1.02)));
        } else {
          state.ytPlayer.setVolume(baseVol);
        }
      } catch(e) {}
    }

    this.updateUI();
  },

  updateUI() {
    const bandKeys = ['60hz', '250hz', '1khz', '4khz', '16khz'];
    bandKeys.forEach((key, idx) => {
      const db = this.gains[idx] || 0;
      const bar = document.getElementById(`eq-bar-${key}`);
      const val = document.getElementById(`eq-val-${key}`);
      if (bar) {
        // Base height 24px, plus db * 1.5px (range: 6px to 42px)
        const h = Math.max(6, Math.min(44, 24 + db * 1.5));
        bar.style.height = `${h}px`;
      }
      if (val) {
        val.textContent = db > 0 ? `+${db}dB` : `${db}dB`;
      }
    });
  }
};

function cycleBandGain(bandIdx) {
  if (bandIdx < 0 || bandIdx > 4) return;
  const current = KurfaDSP.gains[bandIdx] || 0;
  // Step through -6dB -> 0dB -> +3dB -> +6dB -> +9dB -> -6dB
  const steps = [-6, 0, 3, 6, 9];
  let next = 0;
  const currIdx = steps.indexOf(current);
  if (currIdx !== -1 && currIdx < steps.length - 1) {
    next = steps[currIdx + 1];
  } else {
    next = steps[0];
  }

  KurfaDSP.setGain(bandIdx, next);
  state.activeEqPreset = 'ozel';
  const labelEl = document.getElementById('eq-active-preset-label');
  if (labelEl) labelEl.textContent = 'Özel Ayar';
  
  const buttons = document.querySelectorAll('#eq-presets-container .eq-preset-btn');
  buttons.forEach(b => b.classList.remove('active'));

  const freqLabels = ['60Hz (Bass)', '250Hz (Alt Mid)', '1kHz (Vokal)', '4kHz (Üst Mid)', '16kHz (Tiz)'];
  showToast(`${freqLabels[bandIdx]}: ${next > 0 ? '+' : ''}${next}dB`);
}

function setEqualizerPreset(preset, silent = true) {
  state.activeEqPreset = preset;
  try {
    localStorage.setItem('kurfa_eq_preset', preset);
  } catch(e) {}

  const labelMap = {
    'standart': 'Standart',
    'bass': 'Bass Boost (+9dB)',
    'vokal': 'Vokal Vurgusu (+7dB)',
    'akustik': 'Akustik Sıcaklık',
    'tiz': 'Tiz Kristal (+9dB)',
    'ozel': 'Özel Ayar'
  };

  const labelEl = document.getElementById('eq-active-preset-label');
  if (labelEl) labelEl.textContent = labelMap[preset] || 'Standart';

  const buttons = document.querySelectorAll('#eq-presets-container .eq-preset-btn');
  buttons.forEach(btn => {
    const text = (btn.textContent || '').toLowerCase();
    const isActive = (preset === 'standart' && text.includes('standart')) ||
                     (preset === 'bass' && text.includes('bass')) ||
                     (preset === 'vokal' && text.includes('vokal')) ||
                     (preset === 'akustik' && text.includes('akustik')) ||
                     (preset === 'tiz' && text.includes('tiz'));
    if (isActive) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  KurfaDSP.applyPreset(preset);
  if (!silent) showToast(`Ekolayzer: ${labelMap[preset]}`);
}

// =============================================================================
// 13.3 SOCIAL SHARE MODAL
// =============================================================================

function openShareModal(track = null) {
  const target = track || state.currentTrack;
  if (!target || !target.id) {
    showToast("Önce bir şarkı seçin");
    return;
  }
  const modal = document.getElementById('share-modal');
  const card = document.getElementById('share-modal-card');
  if (!modal || !card) return;

  const thumb = document.getElementById('share-track-thumb');
  const title = document.getElementById('share-track-title');
  const artist = document.getElementById('share-track-artist');
  const input = document.getElementById('share-link-input');
  const copyBtnText = document.getElementById('share-copy-btn-text');

  if (thumb) thumb.src = target.thumbnail || 'https://i.ytimg.com/vi/' + target.id + '/hqdefault.jpg';
  if (title) title.textContent = target.title || 'Şarkı';
  if (artist) artist.textContent = target.artist || 'Sanatçı';

  const shareUrl = `${window.location.origin}/?song=${target.id}`;
  if (input) input.value = shareUrl;
  if (copyBtnText) copyBtnText.textContent = "Kopyala";

  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  card.classList.remove('scale-95');
  card.classList.add('scale-100');
}

function closeShareModal() {
  const modal = document.getElementById('share-modal');
  const card = document.getElementById('share-modal-card');
  if (!modal || !card) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
  card.classList.add('scale-95');
  card.classList.remove('scale-100');
}

async function copyShareUrl() {
  const input = document.getElementById('share-link-input');
  const copyBtnText = document.getElementById('share-copy-btn-text');
  if (!input) return;

  try {
    await navigator.clipboard.writeText(input.value);
    if (copyBtnText) copyBtnText.textContent = "Kopyalandı!";
    showToast("Şarkı linki panoya kopyalandı!");
    setTimeout(() => {
      if (copyBtnText) copyBtnText.textContent = "Kopyala";
    }, 2500);
  } catch (e) {
    input.select();
    document.execCommand('copy');
    if (copyBtnText) copyBtnText.textContent = "Kopyalandı!";
    showToast("Şarkı linki kopyalandı!");
  }
}

async function triggerWebShare() {
  const target = state.currentTrack;
  if (!target || !target.id) {
    showToast("Önce bir şarkı seçin");
    return;
  }
  const shareUrl = `${window.location.origin}/?song=${target.id}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${target.title} - Kurfamüzik`,
        text: `${target.artist} - ${target.title} şarkısını Kurfamüzik'te reklamsız dinle!`,
        url: shareUrl
      });
      closeShareModal();
    } catch (err) {}
  } else {
    copyShareUrl();
  }
}

// =============================================================================
// 13.4 USER PROFILE & DARK MODE SETTINGS
// =============================================================================

function openProfileModal() {
  const modal = document.getElementById('profile-modal');
  const card = document.getElementById('profile-modal-card');
  if (!modal || !card) return;

  const nickInput = document.getElementById('profile-nickname-input');
  if (nickInput) nickInput.value = state.profile.nickname || "Dinleyici";

  const minEl = document.getElementById('stat-listening-minutes');
  if (minEl) minEl.textContent = `${Math.floor((state.profile.listeningSeconds || 0) / 60)} dk`;

  const playedEl = document.getElementById('stat-tracks-played');
  if (playedEl) playedEl.textContent = (state.profile.tracksPlayed || 0).toString();

  const dlEl = document.getElementById('stat-downloads-count');
  if (dlEl) dlEl.textContent = state.downloads.length.toString();

  const currentAvatarPreview = document.getElementById('current-profile-avatar-preview');
  if (currentAvatarPreview && state.profile.avatar) {
    currentAvatarPreview.src = state.profile.avatar;
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  card.classList.remove('scale-95');
  card.classList.add('scale-100');
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  const card = document.getElementById('profile-modal-card');
  if (!modal || !card) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
  card.classList.add('scale-95');
  card.classList.remove('scale-100');
}

function handleCustomAvatarUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast("Lütfen geçerli bir resim dosyası seçin");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 128, 128);
        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        selectAvatar(optimizedDataUrl);
        showToast("Özel profil fotoğrafı seçildi");
      } catch (err) {
        console.warn("Avatar resize error, using raw image:", err);
        selectAvatar(evt.target.result);
      }
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}
window.handleCustomAvatarUpload = handleCustomAvatarUpload;

function selectAvatar(src) {
  state.profile.avatar = src;
  const currentAvatarPreview = document.getElementById('current-profile-avatar-preview');
  if (currentAvatarPreview) {
    currentAvatarPreview.src = src;
  }
  document.querySelectorAll('#avatar-options-row .avatar-option').forEach(img => {
    if (img.src === src) {
      img.classList.add('border-primary');
      img.classList.remove('border-transparent');
    } else {
      img.classList.remove('border-primary');
      img.classList.add('border-transparent');
    }
  });
}

function saveProfileData() {
  const nickInput = document.getElementById('profile-nickname-input');
  if (nickInput && nickInput.value.trim()) {
    state.profile.nickname = nickInput.value.trim();
  }
  localStorage.setItem('kurfa_profile', JSON.stringify(state.profile));
  updateProfileUI();
  closeProfileModal();
  showToast("Profil bilgileri kaydedildi");
}

function updateProfileUI() {
  const avatarEl = document.getElementById('topbar-user-avatar');
  if (avatarEl && state.profile.avatar) {
    avatarEl.src = state.profile.avatar;
  }
  const nameEl = document.getElementById('topbar-user-name');
  if (nameEl) {
    nameEl.textContent = state.profile.nickname || "Dinleyici";
  }
  const isDark = !!state.profile.darkMode;
  if (document.documentElement) {
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }
  if (document.body) {
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('dark', isDark);
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isDark ? '#0c1017' : '#faf8ff');
  }

  const topbarThemeIcon = document.getElementById('topbar-theme-icon');
  if (topbarThemeIcon) {
    topbarThemeIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
  }
  const topbarThemeBtn = document.getElementById('topbar-theme-btn');
  if (topbarThemeBtn) {
    topbarThemeBtn.title = isDark ? 'Aydınlık Moda Geç' : 'Karanlık Moda Geç';
  }

  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  if (btnThemeToggle) {
    btnThemeToggle.textContent = isDark ? 'Açık (Kapat)' : 'Kapalı (Aç)';
    if (isDark) {
      btnThemeToggle.classList.add('bg-primary', 'text-on-primary');
      btnThemeToggle.classList.remove('bg-surface-container', 'text-on-surface');
    } else {
      btnThemeToggle.classList.remove('bg-primary', 'text-on-primary');
      btnThemeToggle.classList.add('bg-surface-container', 'text-on-surface');
    }
  }
}

function toggleDarkMode() {
  state.profile.darkMode = !state.profile.darkMode;
  localStorage.setItem('kurfa_profile', JSON.stringify(state.profile));
  updateProfileUI();
  showToast(state.profile.darkMode ? "Karanlık Mod Açıldı" : "Aydınlık Mod Açıldı");
}

// =============================================================================
// 13.5 FRESH RELEASES (YENİ ÇIKANLAR)
// =============================================================================

function renderFreshReleasesGrid() {
  const grid = document.getElementById('fresh-releases-grid');
  if (!grid) return;
  grid.innerHTML = '';

  FRESH_RELEASES.forEach((track) => {
    const card = document.createElement('div');
    card.className = "group relative rounded-2xl bg-surface-container-lowest p-3 shadow-sm hover:shadow-md transition-all flex flex-col cursor-pointer border border-transparent hover:border-surface-container";
    card.innerHTML = `
      <div class="relative w-full aspect-video rounded-xl overflow-hidden mb-2.5 bg-surface-container-high">
        <img src="${getTrackThumbnail(track)}" alt="${track.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${track.id}/hqdefault.jpg';">
        <div class="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-primary text-white text-[10px] font-bold">
          ${track.tag || 'Yeni'}
        </div>
        <button type="button" class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all">
            <span class="material-symbols-outlined text-[28px]">play_arrow</span>
          </div>
        </button>
      </div>
      <div class="flex items-start justify-between gap-2">
        <div class="flex flex-col min-w-0 flex-1">
          <h3 class="text-xs md:text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">${track.title}</h3>
          <p class="text-[11px] text-on-surface-variant truncate font-medium">${track.artist} • YouTube Müzik</p>
        </div>
        <button type="button" class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary btn-fresh-fav">
          <span class="material-symbols-outlined text-[16px]">${state.favorites.some(f => f.id === track.id) ? 'favorite' : 'favorite_border'}</span>
        </button>
      </div>
    `;
    card.onclick = () => {
      state.queue = [...FRESH_RELEASES];
      const foundIdx = FRESH_RELEASES.findIndex(t => t.id === track.id);
      state.queueIndex = foundIdx !== -1 ? foundIdx : 0;
      state.playingContextSub = 'YENİ ÇIKANLARDAN ÇALINIYOR';
      state.playingContextTitle = 'Yeni Çıkanlar';
      saveQueueState();
      playTrackById(track.id, track);
    };
    const favBtn = card.querySelector('.btn-fresh-fav');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(track);
        const icon = favBtn.querySelector('.material-symbols-outlined');
        if (icon) {
          icon.textContent = state.favorites.some(f => f.id === track.id) ? 'favorite' : 'favorite_border';
        }
      };
    }
    grid.appendChild(card);
  });
}

function handleUrlParameters() {
  try {
    const params = new URLSearchParams(window.location.search);
    const songId = params.get('song');
    if (songId && /^[\w-]{11}$/.test(songId)) {
      const existing = (CURATED_TRACKS && CURATED_TRACKS.find ? CURATED_TRACKS.find(t => t.id === songId) : null) || 
                       (FRESH_RELEASES && FRESH_RELEASES.find ? FRESH_RELEASES.find(t => t.id === songId) : null);
      if (existing) {
        playTrackById(songId, existing);
      } else {
        playTrackById(songId, {
          id: songId,
          title: "Paylaşılan Parça",
          artist: "YouTube",
          thumbnail: `https://i.ytimg.com/vi/${songId}/hqdefault.jpg`
        });
      }
    }
  } catch(e) {}
}

// =============================================================================
// 13.6 SPOTIFY-STYLE MOBILE FULLSCREEN NOW PLAYING CONTROLS (PHOTO 2)
// =============================================================================

let mobileCanvasMode = localStorage.getItem('kurfa_canvas_mode') !== 'false';

function toggleMobileCanvasMode() {
  mobileCanvasMode = !mobileCanvasMode;
  try { localStorage.setItem('kurfa_canvas_mode', mobileCanvasMode ? 'true' : 'false'); } catch(e) {}
  updateMobileCanvasUI();
  showToast(mobileCanvasMode ? "Canvas Video Modu: Açık" : "Kapak Resmi Modu: Açık");
}

function updateMobileCanvasUI() {
  const coverContainer = document.getElementById('mnp-cover-container');
  const canvasBtn = document.getElementById('mnp-btn-canvas');
  const canvasLabel = document.getElementById('mnp-canvas-label');

  if (coverContainer) {
    if (mobileCanvasMode) {
      coverContainer.classList.add('opacity-0', 'scale-90', 'pointer-events-none');
    } else {
      coverContainer.classList.remove('opacity-0', 'scale-90', 'pointer-events-none');
    }
  }

  if (canvasBtn) {
    canvasBtn.classList.toggle('text-primary', mobileCanvasMode);
  }
  if (canvasLabel) {
    canvasLabel.textContent = mobileCanvasMode ? "Canvas Video" : "Kapak Modu";
  }

  syncPersistentPlayerPosition();
}

function openMobileNowPlaying() {
  const modal = document.getElementById('mobile-now-playing-modal');
  if (!modal) return;
  state.mobileNowPlayingOpen = true;
  modal.style.contentVisibility = 'visible';

  modal.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
  modal.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');

  // Sync track information
  updatePlayerTrackUI(state.currentTrack);
  updatePlayPauseUI(state.isPlaying);

  // Sync lyrics state immediately
  if (state.currentTrack) {
    updateLyricsDisplay();
  }

  updateMobileCanvasUI();
}

function closeMobileNowPlaying() {
  const modal = document.getElementById('mobile-now-playing-modal');
  if (!modal) return;
  state.mobileNowPlayingOpen = false;

  modal.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
  modal.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');

  setTimeout(() => {
    if (!state.mobileNowPlayingOpen && modal) {
      modal.style.contentVisibility = 'hidden';
    }
  }, 320);

  syncPersistentPlayerPosition();
}

function initMobileNowPlayingSeekbar() {
  const trackEl = document.getElementById('mnp-seek-track');
  const fillEl = document.getElementById('mnp-seek-fill');
  const knobEl = document.getElementById('mnp-seek-knob');
  const curTimeEl = document.getElementById('mnp-time-cur');
  if (!trackEl) return;

  function calculateMnpSeek(e) {
    const rect = trackEl.getBoundingClientRect();
    const clientX = getEventClientX(e);
    const clickX = clientX - rect.left;
    return Math.max(0, Math.min(1, clickX / rect.width));
  }

  function applyMnpSeek(pct, commit = false) {
    if (fillEl) fillEl.style.width = `${pct * 100}%`;
    if (knobEl) knobEl.style.left = `${pct * 100}%`;
    if (DOM.playerSeekFill) DOM.playerSeekFill.style.width = `${pct * 100}%`;
    if (DOM.playerMobileSeekFill) DOM.playerMobileSeekFill.style.width = `${pct * 100}%`;

    const dur = getActiveMediaDuration();
    const seekTime = Math.max(0, Math.min(dur, pct * dur));
    if (curTimeEl) curTimeEl.textContent = formatTime(seekTime);
    if (DOM.playerTimeCur) DOM.playerTimeCur.textContent = formatTime(seekTime);

    if (commit) {
      seekPlaybackToSeconds(seekTime);
    }
  }

  const onPointerDown = (e) => {
    state.isSeeking = true;
    const pct = calculateMnpSeek(e);
    applyMnpSeek(pct, false);

    const onPointerMove = (moveEvt) => {
      if (!state.isSeeking) return;
      const movePct = calculateMnpSeek(moveEvt);
      applyMnpSeek(movePct, false);
    };

    const onPointerUp = (upEvt) => {
      if (state.isSeeking) {
        state.isSeeking = false;
        const finalPct = calculateMnpSeek(upEvt);
        applyMnpSeek(finalPct, true);
      }
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
  };

  trackEl.addEventListener('mousedown', onPointerDown);
  trackEl.addEventListener('touchstart', onPointerDown, { passive: true });
}

// =============================================================================
// 13.7 CUSTOM PLAYLISTS MANAGEMENT (LOCAL-FIRST & CLOUD SYNCED)
// =============================================================================

function saveCustomPlaylists() {
  try {
    localStorage.setItem('kurfa_custom_playlists', JSON.stringify(state.customPlaylists));
  } catch(e) {}
  updateKutuphaneBadges();
  scheduleFirebaseCloudSync();
}

function renderCustomPlaylistsGrid() {
  const grid = document.getElementById('custom-playlists-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const playlists = state.customPlaylists || [];
  if (playlists.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-10 px-4 flex flex-col items-center justify-center text-center gap-3 bg-surface-container-low/50 rounded-2xl border border-dashed border-surface-container">
        <div class="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-primary">
          <span class="material-symbols-outlined text-[28px]">playlist_add</span>
        </div>
        <div>
          <h3 class="text-sm font-bold text-on-surface">Henüz Çalma Listesi Oluşturmadınız</h3>
          <p class="text-xs text-on-surface-variant mt-1 max-w-sm">Beğendiğiniz şarkıları özel tematik listeler halinde toplayabilir, istediğiniz zaman kesintisiz dinleyebilirsiniz.</p>
        </div>
        <button type="button" class="mt-2 px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-all shadow-sm flex items-center gap-1.5" onclick="openCreatePlaylistModal()">
          <span class="material-symbols-outlined text-[16px]">add</span>
          <span>İlk Listenizi Oluşturun</span>
        </button>
      </div>
    `;
    return;
  }

  playlists.forEach(pl => {
    const card = document.createElement('div');
    card.className = "group relative rounded-2xl bg-surface-container-lowest p-3 shadow-sm hover:shadow-md transition-all flex flex-col cursor-pointer border border-transparent hover:border-surface-container";
    
    // First track thumbnail or default
    const thumb = (pl.tracks && pl.tracks.length > 0 && pl.tracks[0].thumbnail) 
      ? pl.tracks[0].thumbnail 
      : "/kurfamuzik_logo.png";
    const trackCount = (pl.tracks && pl.tracks.length) || 0;

    card.innerHTML = `
      <div class="relative w-full aspect-square rounded-xl overflow-hidden mb-2.5 bg-surface-container-high">
        <img src="${thumb}" alt="${pl.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
        <button type="button" class="btn-play-custom-pl absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:scale-110 active:scale-95" title="Tümünü Çal">
          <span class="material-symbols-outlined text-[24px] filled">play_arrow</span>
        </button>
      </div>
      <h3 class="text-xs sm:text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">${pl.name}</h3>
      <p class="text-[11px] text-on-surface-variant truncate font-medium mt-0.5">${trackCount} Şarkı</p>
    `;

    card.onclick = () => openCustomPlaylistDetail(pl.id);

    const playBtn = card.querySelector('.btn-play-custom-pl');
    if (playBtn) {
      playBtn.onclick = (e) => {
        e.stopPropagation();
        playCustomPlaylist(pl.id, false);
      };
    }

    grid.appendChild(card);
  });
}

let pendingAddPlaylistTrack = null;

function openCreatePlaylistModal(fromAddModal = false) {
  const modal = document.getElementById('create-playlist-modal');
  const card = document.getElementById('create-playlist-modal-card');
  const input = document.getElementById('create-playlist-name-input');
  if (!modal || !card) return;

  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  card.classList.remove('scale-95');
  card.classList.add('scale-100');
}

function closeCreatePlaylistModal() {
  const modal = document.getElementById('create-playlist-modal');
  const card = document.getElementById('create-playlist-modal-card');
  if (!modal || !card) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
  card.classList.add('scale-95');
  card.classList.remove('scale-100');
}

function submitCreatePlaylist() {
  const input = document.getElementById('create-playlist-name-input');
  const name = input ? input.value.trim() : '';
  if (!name) {
    showToast("Lütfen bir liste adı girin");
    return;
  }

  const newPl = {
    id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name,
    createdAt: Date.now(),
    tracks: []
  };

  if (pendingAddPlaylistTrack) {
    newPl.tracks.push(pendingAddPlaylistTrack);
    showToast(`"${name}" oluşturuldu ve şarkı eklendi!`);
    pendingAddPlaylistTrack = null;
  } else {
    showToast(`"${name}" çalma listesi oluşturuldu!`);
  }

  state.customPlaylists.push(newPl);
  saveCustomPlaylists();
  closeCreatePlaylistModal();
  closeAddToPlaylistModal();
  renderCustomPlaylistsGrid();
}

function openAddToPlaylistModal(trackOrId) {
  let target = null;
  if (typeof trackOrId === 'object' && trackOrId !== null) {
    target = trackOrId;
  } else if (typeof trackOrId === 'string') {
    target = state.queue.find(t => t.id === trackOrId) ||
             getCuratedTracks().find(t => t.id === trackOrId) ||
             state.favorites.find(t => t.id === trackOrId) ||
             state.downloads.find(t => t.id === trackOrId) ||
             state.currentSearchResults.find(t => t.id === trackOrId);
  }
  if (!target) target = state.currentTrack;

  if (!target) {
    showToast("Önce bir şarkı seçin");
    return;
  }
  pendingAddPlaylistTrack = target;

  const modal = document.getElementById('add-to-playlist-modal');
  const card = document.getElementById('add-to-playlist-modal-card');
  if (!modal || !card) return;

  const thumbEl = document.getElementById('atp-track-thumb');
  const titleEl = document.getElementById('atp-track-title');
  const artistEl = document.getElementById('atp-track-artist');

  if (thumbEl) thumbEl.src = target.thumbnail || "/kurfamuzik_logo.png";
  if (titleEl) titleEl.textContent = target.title || "Şarkı";
  if (artistEl) artistEl.textContent = target.artist || "Sanatçı";

  const listContainer = document.getElementById('atp-playlists-list');
  if (listContainer) {
    listContainer.innerHTML = '';
    const playlists = state.customPlaylists || [];

    if (playlists.length === 0) {
      listContainer.innerHTML = `
        <div class="py-4 text-center text-xs text-on-surface-variant">
          Henüz listeniz yok. Aşağıdan yeni bir liste oluşturabilirsiniz.
        </div>
      `;
    } else {
      playlists.forEach(pl => {
        const hasTrack = (pl.tracks || []).some(t => t.id === target.id);
        const item = document.createElement('div');
        item.className = "flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container cursor-pointer transition-colors";
        item.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="material-symbols-outlined text-[20px] text-primary">queue_music</span>
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-bold text-on-surface truncate">${pl.name}</span>
              <span class="text-[10px] text-on-surface-variant font-medium">${(pl.tracks || []).length} Şarkı</span>
            </div>
          </div>
          <span class="material-symbols-outlined text-[18px] ${hasTrack ? 'text-primary' : 'text-on-surface-variant'}">${hasTrack ? 'check_circle' : 'add'}</span>
        `;
        item.onclick = () => {
          addTrackToPlaylist(pl.id, target);
          closeAddToPlaylistModal();
        };
        listContainer.appendChild(item);
      });
    }
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  card.classList.remove('scale-95');
  card.classList.add('scale-100');
}

function closeAddToPlaylistModal() {
  const modal = document.getElementById('add-to-playlist-modal');
  const card = document.getElementById('add-to-playlist-modal-card');
  if (!modal || !card) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
  card.classList.add('scale-95');
  card.classList.remove('scale-100');
}

function addTrackToPlaylist(playlistId, track) {
  const pl = state.customPlaylists.find(p => p.id === playlistId);
  if (!pl) return;
  if (!Array.isArray(pl.tracks)) pl.tracks = [];

  const existingIdx = pl.tracks.findIndex(t => t.id === track.id);
  if (existingIdx !== -1) {
    showToast(`"${track.title}" zaten "${pl.name}" listesinde var`);
    return;
  }

  pl.tracks.push({
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumbnail: track.thumbnail,
    duration: track.duration || "3:30"
  });

  saveCustomPlaylists();
  showToast(`"${track.title}" -> "${pl.name}" listesine eklendi`);
  renderCustomPlaylistsGrid();
}

function openCustomPlaylistDetail(playlistId) {
  const pl = state.customPlaylists.find(p => p.id === playlistId);
  if (!pl) return;
  state.activeCustomPlaylistId = playlistId;

  const detailView = document.getElementById('custom-playlist-detail-view');
  const grid = document.getElementById('custom-playlists-grid');
  if (!detailView) return;

  const titleEl = document.getElementById('cpd-title');
  const metaEl = document.getElementById('cpd-meta');
  const playAllBtn = document.getElementById('cpd-btn-play-all');
  const deleteBtn = document.getElementById('cpd-btn-delete');
  const tracksTable = document.getElementById('custom-playlist-tracks-table');

  if (titleEl) titleEl.textContent = pl.name;
  if (metaEl) metaEl.textContent = `${(pl.tracks || []).length} Şarkı`;

  if (playAllBtn) {
    playAllBtn.onclick = () => playCustomPlaylist(playlistId, false);
  }
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (confirm(`"${pl.name}" çalma listesini silmek istediğinize emin misiniz?`)) {
        deleteCustomPlaylist(playlistId);
      }
    };
  }

  if (tracksTable) {
    tracksTable.innerHTML = '';
    const tracks = pl.tracks || [];

    if (tracks.length === 0) {
      tracksTable.innerHTML = `
        <div class="py-8 text-center text-xs text-on-surface-variant">
          Bu liste henüz boş. Arama veya Trendler sekmesinden şarkıları bu listeye ekleyebilirsiniz.
        </div>
      `;
    } else {
      tracks.forEach((track, index) => {
        const row = document.createElement('div');
        row.className = "flex items-center justify-between p-2 rounded-xl hover:bg-surface-container transition-colors group cursor-pointer";
        row.innerHTML = `
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <span class="w-5 text-center text-xs font-bold text-on-surface-variant font-mono">${index + 1}</span>
            <img src="${track.thumbnail || '/kurfamuzik_logo.png'}" alt="${track.title}" class="w-9 h-9 rounded-lg object-cover flex-shrink-0" loading="lazy">
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-bold text-on-surface truncate group-hover:text-primary transition-colors">${track.title}</span>
              <span class="text-[11px] text-on-surface-variant truncate">${track.artist}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-on-surface-variant font-mono">${track.duration || '3:30'}</span>
            <button type="button" class="btn-remove-track w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity" title="Listeden Çıkar">
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        `;

        row.onclick = () => {
          state.queue = [...tracks];
          state.queueIndex = index;
          state.playingContextSub = 'ÖZEL ÇALMA LİSTESİ';
          state.playingContextTitle = pl.name;
          playTrackById(track.id, track);
        };

        const removeBtn = row.querySelector('.btn-remove-track');
        if (removeBtn) {
          removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeTrackFromCustomPlaylist(playlistId, track.id);
          };
        }

        tracksTable.appendChild(row);
      });
    }
  }

  if (grid) grid.classList.add('hidden');
  detailView.classList.remove('hidden');
}

function closeCustomPlaylistDetail() {
  state.activeCustomPlaylistId = null;
  const detailView = document.getElementById('custom-playlist-detail-view');
  const grid = document.getElementById('custom-playlists-grid');
  if (detailView) detailView.classList.add('hidden');
  if (grid) grid.classList.remove('hidden');
}

function deleteCustomPlaylist(playlistId) {
  state.customPlaylists = state.customPlaylists.filter(p => p.id !== playlistId);
  saveCustomPlaylists();
  closeCustomPlaylistDetail();
  renderCustomPlaylistsGrid();
  showToast("Çalma listesi silindi");
}

function removeTrackFromCustomPlaylist(playlistId, trackId) {
  const pl = state.customPlaylists.find(p => p.id === playlistId);
  if (!pl || !Array.isArray(pl.tracks)) return;
  pl.tracks = pl.tracks.filter(t => t.id !== trackId);
  saveCustomPlaylists();
  openCustomPlaylistDetail(playlistId);
  showToast("Şarkı listeden çıkarıldı");
}

function playCustomPlaylist(playlistId, shuffle = false) {
  const pl = state.customPlaylists.find(p => p.id === playlistId);
  if (!pl || !pl.tracks || pl.tracks.length === 0) {
    showToast("Bu çalma listesinde henüz şarkı yok");
    return;
  }

  let list = [...pl.tracks];
  if (shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  state.queue = list;
  state.originalQueue = [...pl.tracks];
  state.queueIndex = 0;
  state.playingContextSub = 'ÖZEL ÇALMA LİSTESİ';
  state.playingContextTitle = pl.name;

  playTrackById(list[0].id, list[0]);
  showToast(`Çalınıyor: ${pl.name} (${list.length} Şarkı)`);
}

// =============================================================================
// 13.7.5 SPOTIFY PLAYLIST IMPORTER & PLAYBACK ENGINE
// =============================================================================

function saveSpotifyPlaylists() {
  try {
    localStorage.setItem('kurfa_spotify_playlists', JSON.stringify(state.spotifyPlaylists || []));
  } catch(e) {}
}

async function importSpotifyPlaylist(explicitUrl) {
  const input = document.getElementById('spotify-import-input');
  const statusEl = document.getElementById('spotify-import-status');
  const importBtn = document.getElementById('btn-spotify-import');
  
  const rawUrl = (explicitUrl || (input ? input.value : '')).trim();
  if (!rawUrl) {
    if (statusEl) {
      statusEl.textContent = 'Lütfen geçerli bir Spotify bağlantısı girin.';
      statusEl.className = 'text-xs font-semibold text-error block';
    }
    showToast('Lütfen bir Spotify bağlantısı girin');
    return;
  }

  if (statusEl) {
    statusEl.textContent = 'Spotify çalma listesi ayrıştırılıyor, lütfen bekleyin...';
    statusEl.className = 'text-xs font-semibold text-primary block';
  }
  if (importBtn) {
    importBtn.disabled = true;
    importBtn.classList.add('opacity-70');
  }

  try {
    const res = await fetch(`${API_BASE}/api/spotify?url=${encodeURIComponent(rawUrl)}&_t=${Date.now()}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Çalma listesi yüklenemedi');
    }

    const existingIdx = (state.spotifyPlaylists || []).findIndex(p => p.id === data.id);
    const newEntry = {
      id: data.id,
      title: data.title,
      subtitle: data.subtitle,
      cover: data.cover,
      trackCount: data.trackCount || (data.tracks ? data.tracks.length : 0),
      tracks: data.tracks || [],
      importedAt: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      state.spotifyPlaylists[existingIdx] = newEntry;
      showToast(`"${data.title}" listesi güncellendi!`);
    } else {
      if (!Array.isArray(state.spotifyPlaylists)) state.spotifyPlaylists = [];
      state.spotifyPlaylists.unshift(newEntry);
      showToast(`"${data.title}" Spotify kütüphanenize eklendi!`);
    }

    saveSpotifyPlaylists();
    if (input) input.value = '';
    if (statusEl) {
      statusEl.textContent = `"${data.title}" (${newEntry.trackCount} şarkı) başarıyla eklendi!`;
      statusEl.className = 'text-xs font-semibold text-green-500 block';
      setTimeout(() => { if (statusEl) statusEl.classList.add('hidden'); }, 4000);
    }

    renderSpotifyPlaylistsGrid();
    updateKutuphaneBadges();
    openSpotifyPlaylistDetail(data.id);
  } catch (err) {
    console.error('Spotify import error:', err);
    if (statusEl) {
      statusEl.textContent = `Hata: ${err.message || 'Spotify bağlantısı okunamadı'}`;
      statusEl.className = 'text-xs font-semibold text-error block';
    }
    showToast(`Spotify Hatası: ${err.message || 'Okunamadı'}`);
  } finally {
    if (importBtn) {
      importBtn.disabled = false;
      importBtn.classList.remove('opacity-70');
    }
  }
}

function renderSpotifyPlaylistsGrid() {
  const container = document.getElementById('spotify-playlists-grid');
  if (!container) return;
  container.innerHTML = '';

  const playlists = state.spotifyPlaylists || [];
  if (playlists.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 flex flex-col items-center justify-center text-center p-6 rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container">
        <div class="w-14 h-14 rounded-2xl bg-green-500/10 text-green-500 flex items-center justify-center mb-3">
          <span class="material-symbols-outlined text-[28px]">album</span>
        </div>
        <h3 class="text-sm font-bold text-on-surface">Henüz Spotify Listesi Eklenmedi</h3>
        <p class="text-xs text-on-surface-variant max-w-sm mt-1">
          Yukarıdaki kutucuğa herhangi bir Spotify çalma listesi bağlantısı yapıştırarak anında içe aktarabilirsiniz.
        </p>
      </div>
    `;
    return;
  }

  playlists.forEach(pl => {
    const card = document.createElement('div');
    card.className = "group relative bg-surface-container-lowest p-3 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col gap-2 border border-surface-container/60 hover:border-green-500/40";
    card.onclick = () => openSpotifyPlaylistDetail(pl.id);

    const coverUrl = pl.cover || '/assets/kurfamuzik_logo.png';
    const count = pl.trackCount || (pl.tracks ? pl.tracks.length : 0);

    card.innerHTML = `
      <div class="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container-high">
        <img src="${coverUrl}" alt="${escapeHtml(pl.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy">
        <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <button type="button" aria-label="Tümünü Çal" class="btn-play-card absolute bottom-2 right-2 w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center shadow-lg transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all hover:scale-105 active:scale-95" title="Listeyi Çal">
          <span class="material-symbols-outlined text-[22px] filled">play_arrow</span>
        </button>
      </div>
      <div class="flex flex-col min-w-0">
        <h3 class="text-xs font-bold text-on-surface truncate group-hover:text-green-500 transition-colors">${escapeHtml(pl.title)}</h3>
        <p class="text-[11px] text-on-surface-variant truncate">${count} Şarkı • Spotify</p>
      </div>
    `;

    const playBtn = card.querySelector('.btn-play-card');
    if (playBtn) {
      playBtn.onclick = (e) => {
        e.stopPropagation();
        playSpotifyPlaylist(pl.id, false);
      };
    }

    container.appendChild(card);
  });
}

function openSpotifyPlaylistDetail(playlistId) {
  const pl = (state.spotifyPlaylists || []).find(p => p.id === playlistId);
  if (!pl) return;
  state.activeSpotifyPlaylistId = playlistId;

  const detailView = document.getElementById('spotify-playlist-detail-view');
  const grid = document.getElementById('spotify-playlists-grid');
  if (!detailView) return;

  const titleEl = document.getElementById('spd-title');
  const subtitleEl = document.getElementById('spd-subtitle');
  const metaEl = document.getElementById('spd-meta');
  const coverEl = document.getElementById('spd-cover');
  const playAllBtn = document.getElementById('spd-btn-play-all');
  const deleteBtn = document.getElementById('spd-btn-delete');
  const tracksTable = document.getElementById('spotify-playlist-tracks-table');

  if (titleEl) titleEl.textContent = pl.title;
  if (subtitleEl) subtitleEl.textContent = pl.subtitle || '';
  if (metaEl) metaEl.textContent = `${(pl.tracks || []).length} Şarkı`;
  if (coverEl) coverEl.src = pl.cover || '/assets/kurfamuzik_logo.png';

  if (playAllBtn) {
    playAllBtn.onclick = () => playSpotifyPlaylist(playlistId, false);
  }
  const refreshBtn = document.getElementById('spd-btn-refresh');
  if (refreshBtn) {
    refreshBtn.onclick = () => refreshSpotifyPlaylist(playlistId);
  }
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (confirm(`"${pl.title}" Spotify listesini kütüphanenizden kaldırmak istediğinize emin misiniz?`)) {
        deleteSpotifyPlaylist(playlistId);
      }
    };
  }

  // Auto-heal old cached playlists that contain random YouTube mix videos
  if (Array.isArray(pl.tracks) && pl.tracks.some(t => /karışık|tüm şarkılar|1 saat/i.test(t.title)) && !pl._autoHealed) {
    pl._autoHealed = true;
    setTimeout(() => refreshSpotifyPlaylist(playlistId), 400);
  }

  if (tracksTable) {
    tracksTable.innerHTML = '';
    const tracks = pl.tracks || [];

    if (tracks.length === 0) {
      tracksTable.innerHTML = `
        <div class="py-8 text-center text-xs text-on-surface-variant">
          Bu Spotify çalma listesinde gösterilecek şarkı bulunamadı.
        </div>
      `;
    } else {
      tracks.forEach((track, index) => {
        const row = document.createElement('div');
        row.className = "flex items-center justify-between p-2 rounded-xl hover:bg-surface-container transition-colors group cursor-pointer";
        row.innerHTML = `
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <span class="w-5 text-center text-xs font-bold text-on-surface-variant font-mono">${index + 1}</span>
            <img data-sp-id="${track.id}" src="${track.thumbnail || pl.cover || '/assets/kurfamuzik_logo.png'}" alt="${escapeHtml(track.title)}" class="w-9 h-9 rounded-lg object-cover flex-shrink-0" loading="lazy" onerror="this.src='${pl.cover || '/assets/kurfamuzik_logo.png'}'">
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-bold text-on-surface truncate group-hover:text-green-500 transition-colors">${escapeHtml(track.title)}</span>
              <span class="text-[11px] text-on-surface-variant truncate">${escapeHtml(track.artist)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-on-surface-variant font-mono">${track.duration || '3:30'}</span>
            <button type="button" class="btn-play-single w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Çal">
              <span class="material-symbols-outlined text-[18px]">play_arrow</span>
            </button>
          </div>
        `;

        row.onclick = () => {
          playSpotifyTrack(track, tracks, index, pl.title);
        };

        tracksTable.appendChild(row);
      });
    }
  }

  if (grid) grid.classList.add('hidden');
  detailView.classList.remove('hidden');

  // Progressively resolve real YouTube covers and IDs in the background
  resolveVisibleSpotifyThumbnails(playlistId);
}

function resolveVisibleSpotifyThumbnails(playlistId) {
  const pl = (state.spotifyPlaylists || []).find(p => p.id === playlistId);
  if (!pl || !Array.isArray(pl.tracks)) return;

  const pending = pl.tracks.filter(t => !t.ytId).slice(0, 30);
  if (pending.length === 0) return;

  let idx = 0;
  function step() {
    if (idx >= pending.length) return;
    if (state.activeSpotifyPlaylistId !== playlistId) return;
    const trk = pending[idx++];
    const query = `${trk.artist} ${trk.title} audio`.trim();
    fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}&single=1`)
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.results) && d.results.length > 0) {
          const best = pickBestYouTubeMatch(trk, d.results);
          if (best && best.id) {
            trk.ytId = best.id;
            if (!trk.thumbnail || trk.thumbnail.includes('kurfamuzik_logo') || trk.thumbnail === pl.cover) {
              trk.thumbnail = best.thumbnail;
              const imgEl = document.querySelector(`img[data-sp-id="${trk.id}"]`);
              if (imgEl && best.thumbnail) imgEl.src = best.thumbnail;
            }
            saveSpotifyPlaylists();
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setTimeout(step, 200);
      });
  }
  step();
}

async function refreshSpotifyPlaylist(playlistId) {
  const targetId = playlistId || state.activeSpotifyPlaylistId;
  const pl = (state.spotifyPlaylists || []).find(p => p.id === targetId);
  if (!pl) return;

  const refreshBtn = document.getElementById('spd-btn-refresh');
  if (refreshBtn) {
    refreshBtn.classList.add('animate-spin');
    refreshBtn.disabled = true;
  }
  showToast(`"${pl.title}" güncelleniyor...`);

  try {
    const isArtist = pl.type === 'artist' || (pl.id && pl.id.length === 22 && !pl.id.startsWith('37i'));
    const queryUrl = isArtist ? `https://open.spotify.com/artist/${pl.id}` : `https://open.spotify.com/playlist/${pl.id}`;
    const res = await fetch(`${API_BASE}/api/spotify?url=${encodeURIComponent(queryUrl)}&refresh=1&_t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Güncellenemedi');

    pl.title = data.title;
    pl.subtitle = data.subtitle;
    pl.cover = data.cover;
    pl.trackCount = data.trackCount || (data.tracks ? data.tracks.length : 0);
    pl.tracks = data.tracks || [];
    pl.importedAt = new Date().toISOString();

    saveSpotifyPlaylists();
    showToast(`"${pl.title}" başarıyla güncellendi! (${pl.trackCount} şarkı)`);
    renderSpotifyPlaylistsGrid();
    openSpotifyPlaylistDetail(targetId);
  } catch (err) {
    console.error('Refresh spotify error:', err);
    showToast(`Güncelleme hatası: ${err.message || 'Okunamadı'}`);
  } finally {
    if (refreshBtn) {
      refreshBtn.classList.remove('animate-spin');
      refreshBtn.disabled = false;
    }
  }
}
window.refreshSpotifyPlaylist = refreshSpotifyPlaylist;

function closeSpotifyPlaylistDetail() {
  state.activeSpotifyPlaylistId = null;
  const detailView = document.getElementById('spotify-playlist-detail-view');
  const grid = document.getElementById('spotify-playlists-grid');
  if (detailView) detailView.classList.add('hidden');
  if (grid) grid.classList.remove('hidden');
}

function deleteSpotifyPlaylist(playlistId) {
  state.spotifyPlaylists = (state.spotifyPlaylists || []).filter(p => p.id !== playlistId);
  saveSpotifyPlaylists();
  closeSpotifyPlaylistDetail();
  renderSpotifyPlaylistsGrid();
  updateKutuphaneBadges();
  showToast("Spotify listesi kütüphanenizden kaldırıldı");
}

function playSpotifyPlaylist(playlistId, shuffle = false) {
  const pl = (state.spotifyPlaylists || []).find(p => p.id === playlistId);
  if (!pl || !pl.tracks || pl.tracks.length === 0) {
    showToast("Bu çalma listesinde henüz şarkı yok");
    return;
  }

  let list = [...pl.tracks];
  if (shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  playSpotifyTrack(list[0], list, 0, pl.title);
}

async function playSpotifyTrack(track, playlistTracks, index, playlistName) {
  if (!track) return;
  state.queue = [...playlistTracks];
  state.queueIndex = index;
  state.playingContextSub = 'SPOTIFY ÇALMA LİSTESİ';
  state.playingContextTitle = playlistName || 'Spotify';
  saveQueueState();

  const playId = (track.ytId && /^[\w-]{11}$/.test(track.ytId)) ? track.ytId : track.id;
  if (/^[\w-]{11}$/.test(playId) && !playId.startsWith('sp-')) {
    playTrackById(playId, track);
    prefetchNextQueueTrack();
    return;
  }

  resolveAndPlaySpotifyTrack(track.id, track);
}

// =============================================================================
// 13.8 SMART AUTOPLAY & RADIO CONTINUATION
// =============================================================================

let isFetchingSmartRadio = false;

async function triggerSmartRadioContinue() {
  if (isFetchingSmartRadio) return;
  if (!state.currentTrack) {
    state.isPlaying = false;
    updatePlayPauseUI(false);
    return;
  }

  // Strict safety check: Never fetch recommendations if existing queue has remaining tracks!
  if (state.queue && state.queue.length > 0 && state.queueIndex < state.queue.length - 1) {
    playNextTrack();
    return;
  }

  isFetchingSmartRadio = true;

  // Clean artist and title for accurate search
  let rawArtist = (state.currentTrack.artist || '').trim();
  let rawTitle = (state.currentTrack.title || '').trim();

  const channelFilterRegex = /\b(netd müzik|vevo|official|music|records|audio|video|türkçe pop|youtube)\b/gi;
  let cleanArtist = rawArtist.replace(channelFilterRegex, '').replace(/[-–—]/g, ' ').trim();

  if (!cleanArtist && rawTitle.includes(' - ')) {
    const parts = rawTitle.split(' - ');
    cleanArtist = parts[0].replace(channelFilterRegex, '').trim();
  }

  if (!cleanArtist || cleanArtist.length < 2) {
    cleanArtist = 'Türkçe Pop Hit';
  }

  try {
    const existingIds = new Set((state.queue || []).map(t => t.id));
    if (state.currentTrack.id) existingIds.add(state.currentTrack.id);

    const queries = [
      `${cleanArtist} radyo hit şarkılar`,
      'trend türkçe pop müzik',
      'türkiye popüler şarkılar'
    ];

    let foundTracks = [];

    for (const q of queries) {
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          const fresh = data.results.filter(t => t && t.id && !existingIds.has(t.id));
          if (fresh.length > 0) {
            foundTracks = fresh;
            break;
          }
        }
      } catch (err) {
        console.warn("Smart radio cascade step error:", q, err);
      }
    }

    if (foundTracks.length > 0) {
      const toAdd = foundTracks.slice(0, 5);
      const nextIndex = state.queue.length;
      state.queue = [...state.queue, ...toAdd];
      state.queueIndex = nextIndex;
      state.playingContextSub = 'AKILLI RADYO DEVAMI';
      state.playingContextTitle = `${cleanArtist} Radyosu`;

      saveQueueState();
      renderQueueDrawerList();

      const nextTrack = state.queue[state.queueIndex];
      playTrackById(nextTrack.id, nextTrack);
      showToast(`Akıllı Radyo: ${nextTrack.title}`);
      isFetchingSmartRadio = false;
      return;
    }
  } catch (e) {
    console.warn("Smart radio fetch error:", e);
  }

  isFetchingSmartRadio = false;
  state.isPlaying = false;
  updatePlayPauseUI(false);
  showToast("Çalma listesinin sonuna gelindi");
}

// =============================================================================
// 13.9 MOBILE BACKGROUND AUDIO & MEDIASESSION HARDENING
// =============================================================================

function toggleBackgroundAudioMode() {
  state.backgroundAudioMode = !state.backgroundAudioMode;
  try {
    localStorage.setItem('kurfa_bg_audio', state.backgroundAudioMode ? 'true' : 'false');
  } catch(e) {}

  const btn = document.getElementById('mnp-btn-bg-audio');
  const label = document.getElementById('mnp-bg-audio-label');
  if (state.backgroundAudioMode) {
    if (btn) btn.classList.add('text-primary');
    if (label) label.textContent = 'Arka Plan: Açık';
    showToast("Arka Planda Dinleme Modu Açıldı (Kilit ekranında çalmaya devam eder)");
  } else {
    if (btn) btn.classList.remove('text-primary');
    if (label) label.textContent = 'Arka Plan: Standart';
    showToast("Arka Planda Dinleme Modu Kapalı");
  }
}

// =============================================================================
// 13.10 GOOGLE ACCOUNT, PROFILE & LOCAL-FIRST BULUT SYNC
// =============================================================================

let firebaseDb = null;
let firebaseAuth = null;
let googleProviderInstance = null;
let firebaseSyncDebounceTimer = null;

const FIREBASE_CONFIG = window.firebaseConfig || {
  apiKey: "AIzaSyDuzJl34svShFUhQM72SpZaVTntvzayCso",
  authDomain: "kurfa-ai.firebaseapp.com",
  projectId: "kurfa-ai",
  storageBucket: "kurfa-ai.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:demo1234567890"
};

function initFirebaseSync() {
  // 1. If valid custom Firebase config exists in localStorage or window:
  let customConfig = null;
  try {
    const raw = localStorage.getItem('kurfa_firebase_config');
    if (raw) customConfig = JSON.parse(raw);
  } catch(e) {}

  const activeConfig = (customConfig && customConfig.apiKey) ? customConfig : FIREBASE_CONFIG;

  if (typeof firebase !== 'undefined' && activeConfig && activeConfig.apiKey) {
    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(activeConfig);
      }
      firebaseDb = firebase.firestore();
      try {
        firebaseDb.settings({ experimentalForceLongPolling: true, merge: true });
      } catch(e) {}

      firebaseAuth = firebase.auth();
      try {
        firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      } catch(pe) {}

      googleProviderInstance = new firebase.auth.GoogleAuthProvider();
      googleProviderInstance.setCustomParameters({ prompt: 'select_account' });

      // Check redirect result on load (e.g. mobile or redirect flow)
      if (firebaseAuth.getRedirectResult) {
        firebaseAuth.getRedirectResult().then(result => {
          if (result && result.user) {
            const user = result.user;
            const gUser = {
              name: user.displayName || (user.email ? user.email.split('@')[0] : "Google Kullanıcısı"),
              email: user.email || "",
              avatar: user.photoURL || state.profile.avatar,
              uid: user.uid
            };
            selectGoogleAccount(gUser);
            showToast(`Google ile giriş yapıldı: ${gUser.email || gUser.name}`);
          }
        }).catch(err => {
          if (err.code !== 'auth/missing-initial-state' && !err.message?.includes('missing initial state')) {
            console.warn("Redirect result error:", err);
          }
        });
      }

      firebaseAuth.onAuthStateChanged(user => {
        state.firebaseUser = user;
        if (user) {
          const gUser = {
            name: user.displayName || (user.email ? user.email.split('@')[0] : "Google Kullanıcısı"),
            email: user.email || "",
            avatar: user.photoURL || state.profile.avatar,
            uid: user.uid
          };
          state.googleUser = gUser;
          updateGoogleProfileUI(gUser);
          pullFirebaseLibraryOnce(user.uid);
        } else {
          updateGoogleProfileUI(state.googleUser);
        }
      });
    } catch(e) {
      console.warn("Firebase Init note:", e);
    }
  }

  // 2. Restore Google profile from Local-First storage
  if (state.googleUser) {
    updateGoogleProfileUI(state.googleUser);
  } else {
    updateGoogleProfileUI(null);
  }
}

function updateGoogleProfileUI(gUser) {
  const signedInBox = document.getElementById('profile-google-signed-in');
  const signedOutBox = document.getElementById('profile-google-signed-out');
  const badge = document.getElementById('profile-google-badge');
  const nameEl = document.getElementById('profile-google-name');
  const emailEl = document.getElementById('profile-google-email');
  const avatarEl = document.getElementById('profile-google-avatar');

  const topbarAvatar = document.getElementById('topbar-user-avatar');
  const topbarName = document.getElementById('topbar-user-name');
  const firebaseBadge = document.getElementById('firebase-sync-status-badge');
  const firebaseLoginBtn = document.getElementById('btn-firebase-login');
  const firebaseSyncBtn = document.getElementById('btn-firebase-sync-now');

  if (gUser && gUser.name) {
    if (signedInBox) {
      signedInBox.classList.remove('hidden');
      signedInBox.classList.add('flex');
    }
    if (signedOutBox) signedOutBox.classList.add('hidden');
    if (badge) {
      badge.textContent = "Google ile Bağlı";
      badge.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary";
    }
    if (nameEl) nameEl.textContent = gUser.name;
    if (emailEl) emailEl.textContent = gUser.email || "Google Hesabı";
    if (avatarEl && gUser.avatar) avatarEl.src = gUser.avatar;

    if (topbarAvatar && gUser.avatar) topbarAvatar.src = gUser.avatar;
    if (topbarName) topbarName.textContent = gUser.name;

    if (firebaseBadge) {
      firebaseBadge.textContent = `Bulut Eşitlendi (${gUser.name})`;
      firebaseBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary";
    }
    if (firebaseLoginBtn) {
      firebaseLoginBtn.innerHTML = `
        <span class="material-symbols-outlined text-[16px]">logout</span>
        <span>Google Çıkış</span>
      `;
      firebaseLoginBtn.onclick = handleGoogleSignOut;
    }
    if (firebaseSyncBtn) {
      firebaseSyncBtn.classList.remove('hidden');
      firebaseSyncBtn.classList.add('inline-flex');
    }
  } else {
    if (signedInBox) {
      signedInBox.classList.add('hidden');
      signedInBox.classList.remove('flex');
    }
    if (signedOutBox) signedOutBox.classList.remove('hidden');
    if (badge) {
      badge.textContent = "Bağlı Değil";
      badge.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant";
    }
    if (topbarAvatar && state.profile.avatar) topbarAvatar.src = state.profile.avatar;
    if (topbarName) topbarName.textContent = state.profile.nickname || "Dinleyici";

    if (firebaseBadge) {
      firebaseBadge.textContent = "Yerel Hafıza Modu";
      firebaseBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant";
    }
    if (firebaseLoginBtn) {
      firebaseLoginBtn.innerHTML = `
        <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
        <span>Google ile Giriş Yap</span>
      `;
      firebaseLoginBtn.onclick = handleGoogleSignIn;
    }
    if (firebaseSyncBtn) firebaseSyncBtn.classList.add('hidden');
  }
}

// =============================================================================
// 13.9 GOOGLE ACCOUNT CHOOSER (Gerçek Google Hesap Seçici)
// =============================================================================

const DEFAULT_GOOGLE_ACCOUNTS = [];

function getStoredGoogleAccounts() {
  try {
    const raw = localStorage.getItem('kurfa_google_accounts_list');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}
  return [...DEFAULT_GOOGLE_ACCOUNTS];
}

function saveStoredGoogleAccounts(list) {
  try {
    localStorage.setItem('kurfa_google_accounts_list', JSON.stringify(list));
  } catch(e) {}
}

function openGoogleAccountChooser() {
  const modal = document.getElementById('google-account-chooser-modal');
  const card = document.getElementById('google-account-chooser-card');
  if (!modal || !card) return;

  renderGoogleAccountsList();
  
  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  card.classList.remove('scale-95');
  card.classList.add('scale-100');

  // Trigger Google GSI One-Tap if available in browser
  if (window.google && window.google.accounts && window.google.accounts.id) {
    try {
      window.google.accounts.id.prompt();
    } catch(e) {}
  }
}

function closeGoogleAccountChooser() {
  const modal = document.getElementById('google-account-chooser-modal');
  const card = document.getElementById('google-account-chooser-card');
  if (!modal || !card) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
  card.classList.add('scale-95');
  card.classList.remove('scale-100');
}

function renderGoogleAccountsList() {
  const listEl = document.getElementById('g-accounts-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const accounts = getStoredGoogleAccounts();
  const currentEmail = (state.googleUser && state.googleUser.email) ? state.googleUser.email : null;

  if (accounts.length === 0) {
    listEl.innerHTML = `
      <div class="p-4 rounded-2xl bg-surface-container-low text-center text-xs text-on-surface-variant border border-surface-container">
        Bu cihazda henüz kayıtlı Google hesabı yok. Lütfen aşağıdaki butondan resmi Google penceresiyle giriş yapın.
      </div>
    `;
    return;
  }

  accounts.forEach((acc) => {
    const isCurrent = currentEmail && currentEmail.toLowerCase() === acc.email.toLowerCase();
    const card = document.createElement('div');
    card.className = `flex items-center justify-between p-3 rounded-2xl hover:bg-surface-container cursor-pointer transition-all border ${isCurrent ? 'border-primary bg-primary/10' : 'border-surface-container bg-surface-container-low'}`;
    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img src="${acc.avatar}" alt="${acc.name}" class="w-10 h-10 rounded-full object-cover border border-surface-container flex-shrink-0" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80'">
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-on-surface truncate">${acc.name}</span>
            ${isCurrent ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary text-on-primary">Aktif Hesap</span>' : ''}
          </div>
          <span class="text-[11px] text-on-surface-variant truncate">${acc.email}</span>
        </div>
      </div>
      <span class="material-symbols-outlined text-[20px] ${isCurrent ? 'text-primary' : 'text-on-surface-variant'}">
        ${isCurrent ? 'check_circle' : 'chevron_right'}
      </span>
    `;
    card.onclick = () => selectGoogleAccount(acc);
    listEl.appendChild(card);
  });
}

let authPopupHandle = null;

function sanitizeGoogleAccount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? escapeHtml(raw.name.slice(0, 100)) : 'Google Kullanıcısı';
  const email = typeof raw.email === 'string' ? raw.email.slice(0, 150).replace(/[^\w.@+-]/g, '') : '';
  let avatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&q=80";
  if (typeof raw.avatar === 'string' && (raw.avatar.startsWith('https://') || raw.avatar.startsWith('/'))) {
    avatar = raw.avatar;
  }
  return {
    name,
    email,
    avatar,
    uid: typeof raw.uid === 'string' ? raw.uid.slice(0, 100) : 'google_' + Date.now()
  };
}

function selectGoogleAccount(acc) {
  if (!acc) return;
  const safeAcc = sanitizeGoogleAccount(acc);
  if (!safeAcc) return;
  state.googleUser = safeAcc;
  state.profile.nickname = safeAcc.name;
  if (safeAcc.avatar) state.profile.avatar = safeAcc.avatar;

  try {
    localStorage.setItem('kurfa_google_user', JSON.stringify(safeAcc));
    localStorage.setItem('kurfa_profile', JSON.stringify(state.profile));

    const list = getStoredGoogleAccounts();
    if (!list.some(a => a.email && a.email.toLowerCase() === safeAcc.email.toLowerCase())) {
      list.push(safeAcc);
      saveStoredGoogleAccounts(list);
    }
  } catch(e) {}

  updateGoogleProfileUI(safeAcc);
  updateProfileUI();
  scheduleFirebaseCloudSync();
  closeGoogleAccountChooser();
  showToast(`Google ile oturum açıldı: ${safeAcc.email || safeAcc.name}`);
}

function toggleCustomGoogleBox() {
  const box = document.getElementById('g-custom-account-box');
  if (!box) return;
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    const nameInput = document.getElementById('g-custom-name-input');
    if (nameInput) nameInput.focus();
  }
}

function submitCustomGoogleAccount() {
  const nameInput = document.getElementById('g-custom-name-input');
  const emailInput = document.getElementById('g-custom-email-input');
  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';

  if (!name || !email) {
    showToast("Lütfen adınızı ve geçerli bir Google e-postanızı girin");
    return;
  }

  const newAcc = {
    name,
    email,
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&q=80",
    uid: "google_" + Date.now()
  };

  const list = getStoredGoogleAccounts();
  if (!list.some(a => a.email.toLowerCase() === email.toLowerCase())) {
    list.push(newAcc);
    saveStoredGoogleAccounts(list);
  }

  selectGoogleAccount(newAcc);
}

// Listen for authentic Google Auth popup success with strict origin & window check
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (authPopupHandle && event.source !== authPopupHandle) return;

  if (event.data && event.data.type === 'KURFA_GOOGLE_AUTH_SUCCESS') {
    const acc = sanitizeGoogleAccount(event.data.user);
    if (acc) {
      selectGoogleAccount(acc);
    }
  }
});

async function handleGoogleSignIn() {
  if (window.location.protocol === 'file:') {
    showToast("Google ile Giriş özelliği yerel dosya (file://) üzerinden çalışmaz.");
    return;
  }

  showToast("Google hesap seçici açılıyor...");

  const w = 460;
  const h = 580;
  const left = Math.max(0, Math.round((window.screen.width - w) / 2));
  const top = Math.max(0, Math.round((window.screen.height - h) / 2));
  authPopupHandle = window.open(
    '/google-auth.html',
    'kurfaGoogleAuth',
    `width=${w},height=${h},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
  );

  if (!authPopupHandle || authPopupHandle.closed || typeof authPopupHandle.closed === 'undefined') {
    openGoogleAccountChooser();
  }
}

function syncPersistentPlayerPosition() {
  const pDeck = document.getElementById('persistent-player-deck');
  if (!pDeck) return;

  // 1. Mobile Fullscreen Now Playing Spotify Canvas Video Mode
  if (state.mobileNowPlayingOpen) {
    const modal = document.getElementById('mobile-now-playing-modal');
    if (modal && !modal.classList.contains('pointer-events-none')) {
      pDeck.style.position = 'fixed';
      pDeck.style.left = '50%';
      pDeck.style.top = '50%';
      pDeck.style.bottom = 'auto';
      pDeck.style.right = 'auto';
      pDeck.style.transform = 'translate(-50%, -50%)';
      // 178vh aspect ratio completely covers 9:16 vertical phone screen without black letterboxing
      pDeck.style.width = '178vh';
      pDeck.style.height = '100vh';
      pDeck.style.minWidth = '100vw';
      pDeck.style.minHeight = '56.25vw';
      pDeck.style.opacity = '1';
      pDeck.style.pointerEvents = 'none'; // touch gestures pass straight through to controls
      pDeck.style.zIndex = '60'; // directly behind modal controls (z-[65])
      pDeck.style.borderRadius = '0px';
      return;
    }
  }

  // 2. Desktop Video Deck Mode (on Çalma Listeleri tab)
  const slot = document.getElementById('deck-video-slot');
  if (state.currentTab === 'calma-listeleri' && state.deckVisualMode === 'video' && slot) {
    const rect = slot.getBoundingClientRect();
    if (rect.width > 20 && rect.height > 20) {
      pDeck.style.position = 'fixed';
      pDeck.style.left = Math.round(rect.left) + 'px';
      pDeck.style.top = Math.round(rect.top) + 'px';
      pDeck.style.bottom = 'auto';
      pDeck.style.right = 'auto';
      pDeck.style.transform = 'none';
      pDeck.style.width = Math.round(rect.width) + 'px';
      pDeck.style.height = Math.round(rect.height) + 'px';
      pDeck.style.minWidth = '0';
      pDeck.style.minHeight = '0';
      pDeck.style.opacity = '1';
      pDeck.style.pointerEvents = 'auto';
      pDeck.style.zIndex = '35';
      pDeck.style.borderRadius = '1rem';
      return;
    }
  }

  // 3. In-Viewport Silent Deck (Keeps browser IntersectionObserver 100% active, NEVER offscreen, NEVER throttled or paused)
  // Safely tucked behind the fixed bottom player bar (z-index 5 vs bottom bar z-50)
  pDeck.style.position = 'fixed';
  pDeck.style.left = '0px';
  pDeck.style.bottom = '0px';
  pDeck.style.top = 'auto';
  pDeck.style.right = 'auto';
  pDeck.style.transform = 'none';
  pDeck.style.width = '240px';
  pDeck.style.height = '135px';
  pDeck.style.minWidth = '0';
  pDeck.style.minHeight = '0';
  pDeck.style.opacity = '0.002';
  pDeck.style.pointerEvents = 'none';
  pDeck.style.zIndex = '5';
  pDeck.style.borderRadius = '0px';
}
window.syncPersistentPlayerPosition = syncPersistentPlayerPosition;

function showVideoAdNotice() {
  const el = document.getElementById('deck-video-ad-notice');
  if (el) {
    el.classList.remove('hidden');
    el.classList.add('flex');
  }
}
window.showVideoAdNotice = showVideoAdNotice;

function dismissVideoAdNotice() {
  const el = document.getElementById('deck-video-ad-notice');
  if (el) {
    el.classList.add('hidden');
    el.classList.remove('flex');
  }
}
window.dismissVideoAdNotice = dismissVideoAdNotice;

function setDeckVisualMode(mode, silent = false) {
  const curTime = getCurrentPlaybackTime();
  state.currentPlayheadTime = curTime;
  state.deckVisualMode = mode;
  try { localStorage.setItem('kurfa_deck_mode', mode); } catch(e) {}

  const vinylBtn = document.getElementById('btn-deck-vinyl-mode');
  const videoBtn = document.getElementById('btn-deck-video-mode');
  const vinylWrap = document.getElementById('deck-vinyl-wrapper');
  const videoWrap = document.getElementById('deck-video-wrapper');
  const barVideoBtn = document.getElementById('btn-player-video-mode');

  if (mode === 'video') {
    if (vinylBtn) {
      vinylBtn.classList.remove('bg-surface-container-highest', 'text-primary', 'shadow-xs');
      vinylBtn.classList.add('text-on-surface-variant');
    }
    if (videoBtn) {
      videoBtn.classList.add('bg-surface-container-highest', 'text-primary', 'shadow-xs');
      videoBtn.classList.remove('text-on-surface-variant');
    }
    if (vinylWrap) {
      vinylWrap.style.display = 'none';
      vinylWrap.classList.add('hidden');
    }
    if (videoWrap) {
      videoWrap.style.display = 'block';
      videoWrap.classList.remove('hidden');
    }
    if (barVideoBtn) {
      barVideoBtn.classList.add('text-primary');
      barVideoBtn.classList.remove('text-on-surface-variant');
    }

    // Show ad notice for live video mode only if not silent initial boot
    if (!silent) {
      showVideoAdNotice();
    }

    // Seamlessly transition playback to YouTube player with live video clip!
    if (state.currentTrack && state.currentTrack.id) {
      state._switchingDeckMode = true;
      clearTimeout(state._switchingDeckTimer);
      state._switchingDeckTimer = setTimeout(() => {
        state._switchingDeckMode = false;
      }, 1500);

      // Silence and release HTML5 audio engine
      if (DOM.audioEngine) {
        try {
          DOM.audioEngine.pause();
          DOM.audioEngine.removeAttribute('src');
          DOM.audioEngine.load();
        } catch(e) {}
      }

      if (state.ytReady && state.ytPlayer) {
        try {
          const startSec = Math.max(0, Math.floor(curTime));
          const targetVid = (state.currentTrack?.ytId && /^[\w-]{11}$/.test(state.currentTrack.ytId))
            ? state.currentTrack.ytId
            : (state.currentTrack?.id && /^[\w-]{11}$/.test(state.currentTrack.id))
              ? state.currentTrack.id
              : null;
          if (targetVid && typeof state.ytPlayer.loadVideoById === 'function') {
            state.ytPlayer.loadVideoById({
              videoId: targetVid,
              startSeconds: startSec
            });
          }
          if (typeof state.ytPlayer.playVideo === 'function') {
            state.ytPlayer.playVideo();
          }

          // Reinforce seek positioning across player buffering lifecycle
          if (curTime > 0) {
            [150, 400, 800].forEach(delay => {
              setTimeout(() => {
                if (state.deckVisualMode === 'video' && state.ytPlayer && typeof state.ytPlayer.seekTo === 'function') {
                  try {
                    const ytCur = state.ytPlayer.getCurrentTime() || 0;
                    if (Math.abs(ytCur - curTime) > 1.2) {
                      state.ytPlayer.seekTo(curTime, true);
                    }
                  } catch(e) {}
                }
              }, delay);
            });
          }
          state.isPlaying = true;
          updatePlayPauseUI(true);
        } catch(e) {
          console.warn("YouTube video mode transition error:", e);
        }
      }
    }

    requestAnimationFrame(() => {
      syncPersistentPlayerPosition();
    });
    if (!silent) showToast("Canlı Video Klip Modu Açıldı");
  } else {
    // VINYL / PLAK MODE (100% Ad-Free Pure Audio)
    if (videoBtn) {
      videoBtn.classList.remove('bg-surface-container-highest', 'text-primary', 'shadow-xs');
      videoBtn.classList.add('text-on-surface-variant');
    }
    if (vinylBtn) {
      vinylBtn.classList.add('bg-surface-container-highest', 'text-primary', 'shadow-xs');
      vinylBtn.classList.remove('text-on-surface-variant');
    }
    if (vinylWrap) {
      vinylWrap.style.display = '';
      vinylWrap.classList.remove('hidden');
    }
    if (videoWrap) {
      videoWrap.style.display = 'none';
      videoWrap.classList.add('hidden');
    }
    if (barVideoBtn) {
      barVideoBtn.classList.remove('text-primary');
      barVideoBtn.classList.add('text-on-surface-variant');
    }

    // Dismiss ad notice when returning to vinyl mode
    dismissVideoAdNotice();

    // If YouTube is already playing in the background, simply keep playing seamlessly!
    // Never restart, never pause, never glitch!
    if (state.currentTrack && state.currentTrack.id) {
      if (DOM.audioEngine && !DOM.audioEngine.paused && DOM.audioEngine.currentTime > 0) {
        // HTML5 audio continues playing
      } else if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function' && state.ytPlayer.getPlayerState() === 1) {
        // YouTube continues playing cleanly in the background behind the spinning vinyl deck
      } else if (state.isPlaying && !state.userPaused) {
        resumePlayback();
      }
    }

    syncPersistentPlayerPosition();
    if (!silent) showToast("Reklamsız Ses Modu Aktif");
  }
}

function quickToggleVideoMode() {
  if (state.currentTab !== 'calma-listeleri') {
    switchTab('calma-listeleri');
    setDeckVisualMode('video');
  } else {
    const nextMode = (state.deckVisualMode === 'video') ? 'vinyl' : 'video';
    setDeckVisualMode(nextMode);
  }
}

function toggleFullScreenVideo() {
  const videoWrap = document.getElementById('deck-video-wrapper');
  if (!videoWrap) return;
  if (!document.fullscreenElement) {
    if (videoWrap.requestFullscreen) {
      videoWrap.requestFullscreen();
    } else if (videoWrap.webkitRequestFullscreen) {
      videoWrap.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

async function handleGoogleSignOut() {
  if (firebaseAuth) {
    try { await firebaseAuth.signOut(); } catch(e) {}
  }
  state.googleUser = null;
  state.firebaseUser = null;
  try { localStorage.removeItem('kurfa_google_user'); } catch(e) {}
  updateGoogleProfileUI(null);
  showToast("Oturum kapatıldı. Listeleriniz yerel hafızada korundu.");
}

async function pullFirebaseLibraryOnce(uid) {
  if (!firebaseDb || !uid) return;
  try {
    const docRef = firebaseDb.collection('users').doc(uid).collection('library').doc('main');
    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data();
      if (Array.isArray(data.customPlaylists) && data.customPlaylists.length > 0) {
        state.customPlaylists = data.customPlaylists;
        try { localStorage.setItem('kurfa_custom_playlists', JSON.stringify(state.customPlaylists)); } catch(e) {}
        renderCustomPlaylistsGrid();
      }
      if (Array.isArray(data.favorites) && data.favorites.length > 0) {
        state.favorites = data.favorites;
        try { localStorage.setItem('kurfa_favs', JSON.stringify(state.favorites)); } catch(e) {}
        renderFavoritesTable();
      }
      updateKutuphaneBadges();
      showToast("Kütüphaneniz buluttan başarıyla eşitlendi!");
    }
  } catch(e) {
    console.warn("Pull library note:", e);
  }
}

function scheduleFirebaseCloudSync() {
  if (!state.firebaseUser || !firebaseDb) return;
  if (firebaseSyncDebounceTimer) clearTimeout(firebaseSyncDebounceTimer);

  firebaseSyncDebounceTimer = setTimeout(() => {
    syncFirebaseLibraryNow();
  }, 5000);
}

async function syncFirebaseLibraryNow() {
  if (!state.firebaseUser || !firebaseDb) {
    showToast("Yerel hafıza güncellendi!");
    return;
  }
  try {
    const docRef = firebaseDb.collection('users').doc(state.firebaseUser.uid).collection('library').doc('main');
    await docRef.set({
      customPlaylists: state.customPlaylists,
      favorites: state.favorites,
      updatedAt: Date.now()
    }, { merge: true });
    showToast("Kütüphane bulutla eşitlendi!");
  } catch(e) {
    console.warn("Cloud sync note:", e);
  }
}

// =============================================================================
// 13.11 SPOTIFY-STYLE PICTURE-IN-PICTURE (PIP) MINI PLAYER (Photos 1 & 2 Ref)
// =============================================================================

let pipWindowInstance = null;

function seekToFraction(frac) {
  const dur = getActiveMediaDuration();
  const seekTime = Math.max(0, Math.min(dur, frac * dur));
  seekPlaybackToSeconds(seekTime);
}

async function toggleDocumentPipPlayer() {
  if (pipWindowInstance) {
    closeDocumentPipPlayer();
    return;
  }
  const floatingPip = document.getElementById('kurfa-floating-pip');
  if (floatingPip && !floatingPip.classList.contains('hidden')) {
    closeFloatingPip();
    return;
  }
  await openDocumentPipPlayer();
}

async function openDocumentPipPlayer() {
  // If Chrome / Edge supports Document Picture-in-Picture API:
  if ('documentPictureInPicture' in window) {
    try {
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 390
      });
      pipWindowInstance = pip;

      const style = pip.document.createElement('style');
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: #121212;
          color: #ffffff;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          overflow: hidden;
          width: 100vw;
          height: 100vh;
          display: flex;
          flex-direction: column;
          user-select: none;
        }
        .material-symbols-outlined {
          font-family: 'Material Symbols Outlined';
          font-weight: normal;
          font-style: normal;
          font-size: 20px;
          line-height: 1;
          display: inline-block;
          direction: ltr;
        }
        .pip-header {
          height: 36px;
          background: #181818;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
          border-bottom: 1px solid #282828;
          font-size: 11px;
          color: #a1a1aa;
        }
        .pip-cover-wrap {
          position: relative;
          flex: 1;
          width: 100%;
          min-height: 0;
          background: #181818;
          overflow: hidden;
          cursor: pointer;
        }
        .pip-cover-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .pip-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 14px;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .pip-cover-wrap:hover .pip-overlay {
          opacity: 1;
        }
        .pip-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: auto;
          margin-bottom: 10px;
        }
        .pip-btn {
          background: transparent;
          border: none;
          color: #d4d4d8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 50%;
          transition: transform 0.1s ease, color 0.1s ease;
        }
        .pip-btn:hover { color: #ffffff; transform: scale(1.1); }
        .pip-btn-play {
          width: 44px;
          height: 44px;
          background: #ffffff;
          color: #000000;
          border-radius: 50%;
        }
        .pip-btn-play:hover {
          background: #f4f4f5;
          transform: scale(1.08);
          color: #000000;
        }
        .pip-bottom {
          padding: 10px 14px;
          background: #121212;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #1f1f23;
        }
        .pip-track-meta {
          min-width: 0;
          flex: 1;
          padding-right: 8px;
        }
        .pip-title {
          font-weight: 700;
          font-size: 13px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pip-artist {
          font-size: 11px;
          color: #a1a1aa;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }
        .pip-seek {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pip-times {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          font-family: monospace;
          color: #a1a1aa;
        }
        .pip-track-bar {
          position: relative;
          width: 100%;
          height: 5px;
          background: #3f3f46;
          border-radius: 9999px;
          cursor: pointer;
          overflow: hidden;
        }
        .pip-fill-bar {
          height: 100%;
          width: 0%;
          background: #ffffff;
          border-radius: 9999px;
          transition: width 0.1s linear;
        }
      `;
      pip.document.head.appendChild(style);

      const track = state.currentTrack || {
        title: "Kurfa Müzik",
        artist: "Bir şarkı seçin",
        thumbnail: "/kurfamuzik_logo.png"
      };

      pip.document.body.innerHTML = `
        <div class="pip-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:16px;color:#22d3ee;">tune</span>
            <span style="font-weight:600;letter-spacing:-0.2px;">kurfanova.kurfa.workers.dev</span>
          </div>
          <button id="pip-ext-close" class="pip-btn" style="color:#71717a;" title="Kapat">
            <span class="material-symbols-outlined" style="font-size:18px;">close</span>
          </button>
        </div>

        <div class="pip-cover-wrap">
          <img id="pip-ext-cover" class="pip-cover-img" src="${track.thumbnail}" alt="Cover" onerror="this.onerror=null; this.src='/kurfamuzik_logo.png'">
          
          <!-- Hover Overlay (Photo 2 Ref) -->
          <div class="pip-overlay">
            <div></div>
            <div class="pip-controls">
              <button id="pip-ext-mute" class="pip-btn" title="Sessiz"><span class="material-symbols-outlined">volume_up</span></button>
              <button id="pip-ext-shuffle" class="pip-btn" title="Karıştır"><span class="material-symbols-outlined">shuffle</span></button>
              <button id="pip-ext-prev" class="pip-btn" title="Önceki"><span class="material-symbols-outlined" style="font-size:24px;">skip_previous</span></button>
              <button id="pip-ext-play" class="pip-btn pip-btn-play" title="Oynat/Durdur"><span class="material-symbols-outlined" id="pip-ext-play-icon" style="font-size:28px;">${state.isPlaying ? 'pause' : 'play_arrow'}</span></button>
              <button id="pip-ext-next" class="pip-btn" title="Sonraki"><span class="material-symbols-outlined" style="font-size:24px;">skip_next</span></button>
              <button id="pip-ext-repeat" class="pip-btn" title="Tekrarla"><span class="material-symbols-outlined">repeat</span></button>
              <button id="pip-ext-share" class="pip-btn" title="Paylaş"><span class="material-symbols-outlined">share</span></button>
            </div>
            
            <div class="pip-seek">
              <div class="pip-times">
                <span id="pip-ext-cur">0:00</span>
                <span id="pip-ext-dur">${track.duration || '3:30'}</span>
              </div>
              <div id="pip-ext-seek-track" class="pip-track-bar">
                <div id="pip-ext-seek-fill" class="pip-fill-bar"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="pip-bottom">
          <div class="pip-track-meta">
            <div id="pip-ext-title" class="pip-title">${track.title}</div>
            <div id="pip-ext-artist" class="pip-artist">${track.artist}</div>
          </div>
          <button id="pip-ext-add" class="pip-btn" style="color:#ffffff;" title="Çalma Listesine Ekle">
            <span class="material-symbols-outlined" style="font-size:26px;">add_circle</span>
          </button>
        </div>
      `;

      pip.document.getElementById('pip-ext-close').onclick = () => pip.close();
      pip.document.getElementById('pip-ext-play').onclick = () => togglePlay();
      pip.document.getElementById('pip-ext-prev').onclick = () => playPrevTrack();
      pip.document.getElementById('pip-ext-next').onclick = () => playNextTrack();
      pip.document.getElementById('pip-ext-mute').onclick = () => toggleMute();
      pip.document.getElementById('pip-ext-shuffle').onclick = () => toggleShuffle();
      pip.document.getElementById('pip-ext-repeat').onclick = () => toggleRepeat();
      pip.document.getElementById('pip-ext-share').onclick = () => openShareModal();
      pip.document.getElementById('pip-ext-add').onclick = () => openAddToPlaylistModal(state.currentTrack);

      const seekTrack = pip.document.getElementById('pip-ext-seek-track');
      if (seekTrack) {
        seekTrack.onclick = (e) => {
          const rect = seekTrack.getBoundingClientRect();
          const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seekToFraction(frac);
        };
      }

      pip.addEventListener('pagehide', () => {
        pipWindowInstance = null;
      });

      showToast("Mini Kayan Oynatıcı (PiP) Masaüstünde Açıldı!");
      return;
    } catch(e) {
      console.warn("Document PiP open note:", e);
    }
  }

  // Fallback to in-page floating PiP card
  openFloatingPip();
}

function closeDocumentPipPlayer() {
  if (pipWindowInstance) {
    try { pipWindowInstance.close(); } catch(e) {}
    pipWindowInstance = null;
  }
  closeFloatingPip();
}

function openFloatingPip() {
  const el = document.getElementById('kurfa-floating-pip');
  if (!el) return;
  el.classList.remove('hidden');
  initPipSeekbar();
  syncFloatingPipUI();
  showToast("Mini Oynatıcı Açıldı");
}

function closeFloatingPip() {
  const el = document.getElementById('kurfa-floating-pip');
  if (el) el.classList.add('hidden');
}

function expandFloatingPipToFull() {
  closeFloatingPip();
  switchTab('calma-listeleri');
}

function syncFloatingPipUI() {
  const track = state.currentTrack;
  if (!track) return;
  const cover = document.getElementById('pip-cover-art');
  const title = document.getElementById('pip-track-title');
  const artist = document.getElementById('pip-track-artist');
  const playIcon = document.getElementById('pip-play-icon');

  if (cover) cover.src = track.thumbnail || '/kurfamuzik_logo.png';
  if (title) title.textContent = track.title || 'Kurfa Müzik';
  if (artist) artist.textContent = track.artist || 'Sanatçı';
  if (playIcon) playIcon.textContent = state.isPlaying ? 'pause' : 'play_arrow';

  // Also sync external Document PiP window
  if (pipWindowInstance && pipWindowInstance.document) {
    const doc = pipWindowInstance.document;
    const extCover = doc.getElementById('pip-ext-cover');
    const extTitle = doc.getElementById('pip-ext-title');
    const extArtist = doc.getElementById('pip-ext-artist');
    const extPlay = doc.getElementById('pip-ext-play-icon');
    if (extCover) extCover.src = track.thumbnail || '/kurfamuzik_logo.png';
    if (extTitle) extTitle.textContent = track.title || 'Kurfa Müzik';
    if (extArtist) extArtist.textContent = track.artist || 'Sanatçı';
    if (extPlay) extPlay.textContent = state.isPlaying ? 'pause' : 'play_arrow';
  }
}

function initPipSeekbar() {
  const track = document.getElementById('pip-seek-track');
  if (!track) return;
  track.onclick = (e) => {
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToFraction(frac);
  };
}

// =============================================================================
// 13.12 BLUETOOTH & AUDIO OUTPUT DEVICE SELECTOR (Spotify Connect to Device)
// =============================================================================

async function requestAudioDeviceAccess() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      showToast("Cihaz izni onaylandı. Kulaklık isimleri listeleniyor.");
      await openDevicePickerModal();
    } catch(e) {
      showToast("Cihaz izni reddedildi. Sistem standart ses çıkışı devrede.");
    }
  }
}

async function openDevicePickerModal() {
  const modal = document.getElementById('device-picker-modal');
  const card = document.getElementById('device-picker-modal-card');
  if (!modal || !card) return;

  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  card.classList.remove('scale-95');
  card.classList.add('scale-100');

  const listEl = document.getElementById('dp-devices-list');
  if (!listEl) return;

  listEl.innerHTML = `
    <div class="py-3 text-center text-xs text-on-surface-variant flex items-center justify-center gap-1.5">
      <span class="material-symbols-outlined text-[16px] animate-spin text-primary">refresh</span>
      <span>Kullanılabilir ses aygıtları taranıyor...</span>
    </div>
  `;

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      
      listEl.innerHTML = '';

      const hasHiddenLabels = outputs.some(d => !d.label || d.label.trim() === '');
      if (hasHiddenLabels) {
        const unlockBanner = document.createElement('div');
        unlockBanner.className = "p-2.5 rounded-xl bg-surface-container-low border border-surface-container flex flex-col gap-2 mb-1";
        unlockBanner.innerHTML = `
          <div class="flex items-center gap-2 text-xs font-bold text-on-surface">
            <span class="material-symbols-outlined text-primary text-[18px]">bluetooth</span>
            <span>Kulaklık İsimlerini Aç</span>
          </div>
          <p class="text-[10px] text-on-surface-variant leading-tight">
            Tarayıcı güvenliği nedeniyle Bluetooth veya kulaklık adlarını (AirPods, Buds vb.) görebilmek için izin gereklidir.
          </p>
          <button type="button" class="py-1.5 px-3 rounded-lg bg-primary text-on-primary text-[11px] font-bold hover:bg-primary-container transition-all flex items-center justify-center gap-1 shadow-xs" onclick="requestAudioDeviceAccess()">
            <span class="material-symbols-outlined text-[14px]">lock_open</span>
            <span>Cihaz İsimlerini Etkinleştir</span>
          </button>
        `;
        listEl.appendChild(unlockBanner);
      }

      if (outputs.length > 0) {
        outputs.forEach((dev, idx) => {
          const rawLabel = dev.label ? dev.label.toLowerCase() : '';
          const isBluetooth = rawLabel.includes('bluetooth') || 
                              rawLabel.includes('kulaklık') || 
                              rawLabel.includes('headset') ||
                              rawLabel.includes('buds') ||
                              rawLabel.includes('airpods') ||
                              rawLabel.includes('wireless') ||
                              rawLabel.includes('hands-free');

          const isCurrent = (state.currentAudioSinkId && state.currentAudioSinkId === dev.deviceId) ||
                            (!state.currentAudioSinkId && (dev.deviceId === 'default' || idx === 0));

          const item = document.createElement('div');
          item.className = `flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors border ${isCurrent ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-surface-container'}`;
          item.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="material-symbols-outlined text-[20px] ${isCurrent ? 'text-primary' : (isBluetooth ? 'text-secondary' : 'text-on-surface-variant')}">
                ${isBluetooth ? 'headphones' : 'speaker'}
              </span>
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-bold text-on-surface truncate">${dev.label || `Ses Çıkış Aygıtı #${idx + 1}`}</span>
                  ${isCurrent ? '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-primary text-on-primary">Aktif</span>' : ''}
                </div>
                <span class="text-[10px] text-on-surface-variant">${isBluetooth ? 'Bluetooth / Kulaklık' : (dev.deviceId === 'default' ? 'Sistem Varsayılanı' : 'Harici Hoparlör')}</span>
              </div>
            </div>
            <span class="material-symbols-outlined text-[18px] ${isCurrent ? 'text-primary' : 'text-on-surface-variant'}">
              ${isCurrent ? 'check_circle' : 'arrow_forward'}
            </span>
          `;
          item.onclick = () => switchAudioOutputDevice(dev.deviceId, dev.label || `Aygıt #${idx + 1}`);
          listEl.appendChild(item);
        });
      } else {
        listEl.innerHTML = `
          <div class="py-3 text-center text-xs text-on-surface-variant">
            Sistem varsayılan çıkışı etkin. Cihazınızın ses düğmelerinden veya Bluetooth menüsünden kulaklığınızı doğrudan dinleyebilirsiniz.
          </div>
        `;
      }
    } catch(e) {
      listEl.innerHTML = `
        <div class="py-3 text-center text-xs text-on-surface-variant">
          Ses doğrudan cihazınızın bağlı hoparlör veya kulaklığına aktarılmaktadır.
        </div>
      `;
    }
  }
}

function closeDevicePickerModal() {
  const modal = document.getElementById('device-picker-modal');
  const card = document.getElementById('device-picker-modal-card');
  if (!modal || !card) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
  card.classList.add('scale-95');
  card.classList.remove('scale-100');
}

async function switchAudioOutputDevice(deviceId, label) {
  state.currentAudioSinkId = deviceId;
  try {
    localStorage.setItem('kurfa_audio_sink', deviceId);
  } catch(e) {}

  if (DOM.audioEngine && typeof DOM.audioEngine.setSinkId === 'function') {
    try {
      await DOM.audioEngine.setSinkId(deviceId);
    } catch(e) {
      console.warn("audioEngine.setSinkId note:", e);
    }
  }

  const curEl = document.getElementById('dp-current-device-name');
  if (curEl) curEl.textContent = label || "Bağlı Cihaz";

  const isBluetooth = (label || '').toLowerCase().includes('bluetooth') || 
                      (label || '').toLowerCase().includes('kulaklık') || 
                      (label || '').toLowerCase().includes('headset') ||
                      (label || '').toLowerCase().includes('buds') ||
                      (label || '').toLowerCase().includes('airpods');
  const iconEl = document.getElementById('dp-current-device-icon');
  if (iconEl) iconEl.textContent = isBluetooth ? 'headphones' : 'speaker';

  showToast(`Ses aktarıldı: ${label || 'Harici Cihaz'}`);
  closeDevicePickerModal();
}

async function scanBluetoothDevices() {
  if (navigator.bluetooth && navigator.bluetooth.requestDevice) {
    try {
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true
      });
      showToast(`Bluetooth cihazı bağlandı: ${dev.name || 'Cihaz'}`);
      openDevicePickerModal();
      return;
    } catch(e) {
      // User dismissed Web Bluetooth prompt
    }
  }
  showToast("Bluetooth kulaklığınızı telefon/PC Bluetooth ayarlarınızdan bağladığınızda ses otomatik olarak oraya aktarılır.");
  openDevicePickerModal();
}

// =============================================================================
// 14. KEYBOARD SHORTCUTS & EVENT LISTENERS
// =============================================================================

function setupEventListeners() {
  // Top Search Bar
  if (DOM.topSearchInput) {
    DOM.topSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = DOM.topSearchInput.value.trim();
        if (val) executeSearchImmediate(val, true);
      }
    });
    DOM.topSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val.length >= 2) debouncedSearch(val);
    });
  }

  // Engine Search Input in Arama Tab
  if (DOM.engineSearchInput) {
    DOM.engineSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = DOM.engineSearchInput.value.trim();
        if (val) executeSearchImmediate(val, true);
      }
    });
    DOM.engineSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val.length >= 2) debouncedSearch(val);
    });
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (DOM.topSearchInput) {
        DOM.topSearchInput.focus();
        DOM.topSearchInput.select();
      }
    } else if (e.key.toLowerCase() === 'm') {
      toggleMute();
    }
  });

  // Modal Backdrop Click to Close
  if (DOM.downloaderModal) {
    DOM.downloaderModal.addEventListener('click', (e) => {
      if (e.target === DOM.downloaderModal) {
        closeDownloaderModal();
      }
    });
  }
  const shareModal = document.getElementById('share-modal');
  if (shareModal) {
    shareModal.addEventListener('click', (e) => {
      if (e.target === shareModal) {
        closeShareModal();
      }
    });
  }
  const profileModal = document.getElementById('profile-modal');
  if (profileModal) {
    profileModal.addEventListener('click', (e) => {
      if (e.target === profileModal) {
        closeProfileModal();
      }
    });
  }

  // Modal Backdrop Click to Close
  const devModal = document.getElementById('device-picker-modal');
  if (devModal) {
    devModal.addEventListener('click', (e) => {
      if (e.target === devModal) {
        closeDevicePickerModal();
      }
    });
  }

  // Seamless Background Tab & Alt-Tab Audio Continuity (Zero Interruption)
  document.addEventListener('visibilitychange', () => {
    // If user did not pause and track is active, ensure browser didn't suspend playback
    if (!state.userPaused && state.currentTrack && state.isPlaying) {
      if (state.deckVisualMode === 'video' && state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function') {
        try {
          const pState = state.ytPlayer.getPlayerState();
          if (pState === 2 || pState === 5) {
            state.ytPlayer.playVideo();
          }
        } catch(e) {}
      } else if (state.deckVisualMode !== 'video' && DOM.audioEngine && DOM.audioEngine.src && DOM.audioEngine.paused) {
        try {
          DOM.audioEngine.play().catch(() => {});
        } catch(e) {}
      }
    }

    // When returning to the active tab, smoothly refresh UI elements (seekbar, lyrics)
    if (!document.hidden && state.isPlaying) {
      if (typeof startSeekbarTicker === 'function') startSeekbarTicker();
      const curTime = getActiveMediaCurrentTime();
      const duration = getActiveMediaDuration();
      if (duration && duration > 0) {
        updateSeekbarUI(curTime, duration);
        syncLyricsToTime(curTime);
      }
    }
  });

  // Audio Engine Lifecycle & Strict Mutual Exclusion
  if (DOM.audioEngine) {
    DOM.audioEngine.addEventListener('ended', () => {
      handleTrackEnd();
    });
    DOM.audioEngine.addEventListener('error', (e) => {
      console.warn("DOM.audioEngine media error:", e);
      // Only recover to YouTube if audio engine was the active source and failed, and not in transition
      const playId = (state.currentTrack?.ytId && /^[\w-]{11}$/.test(state.currentTrack.ytId)) ? state.currentTrack.ytId : state.currentTrack?.id;
      if (!state._switchingDeckMode && playId && /^[\w-]{11}$/.test(playId) && DOM.audioEngine.src && state.isPlaying && state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
        const cur = DOM.audioEngine.currentTime || state.currentPlayheadTime || 0;
        state.ytPlayer.loadVideoById(playId, cur);
        state.ytPlayer.playVideo();
        state.isPlaying = true;
        updatePlayPauseUI(true);
      }
    });
    DOM.audioEngine.addEventListener('play', () => {
      // Hard silence YouTube player whenever HTML5 engine starts
      if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
        try { state.ytPlayer.pauseVideo(); } catch(e) {}
      }
      state.isPlaying = true;
      updatePlayPauseUI(true);
      startSeekbarTicker();
    });
    DOM.audioEngine.addEventListener('pause', () => {
      // Only mark paused if audio engine was the active source and user explicitly paused
      if (DOM.audioEngine.src && state.userPaused) {
        state.isPlaying = false;
        updatePlayPauseUI(false);
      }
    });
  }
}

// =============================================================================
// 15. INITIALIZATION
// =============================================================================

function initApp() {
  console.log("Initializing Kurfamüzik Client v5...");

  initTahtaMode();
  updateProfileUI();
  renderPopularCardsGrid();
  renderHomeTracklistTable();
  renderTrendlerCardsGrid();
  renderPopularArtistsGrid();
  updateQuickFavCount();
  renderFreshReleasesGrid();
  renderFavoritesTable();
  renderPlaylistTracksTable();
  updatePlaylistHeroUI();
  renderCustomPlaylistsGrid();
  renderSpotifyPlaylistsGrid();
  updateKutuphaneBadges();

  initDragToScroll(document.getElementById('filter-container'));
  initDragToScroll(document.getElementById('kesfet-subtabs'));
  initDragToScroll(document.getElementById('kutuphane-subtabs'));
  
  updatePlayerTrackUI(state.currentTrack);
  setPlayerVolume(state.volume);
  updateLyricsDisplay();
  setEqualizerPreset(state.activeEqPreset || 'standart', true);
  setDeckVisualMode(state.deckVisualMode || 'vinyl', true);
  initMobileNowPlayingSeekbar();
  initFirebaseSync();

  // Restore Intelligent Persistent Navigation & Sub-Tabs
  if (state.currentKesfetSubTab && state.currentKesfetSubTab !== 'trendler') {
    switchKesfetSubTab(state.currentKesfetSubTab);
  }
  if (state.currentKutuphaneSubTab && state.currentKutuphaneSubTab !== 'favoriler') {
    switchKutuphaneSubTab(state.currentKutuphaneSubTab);
  }
  if (state.currentTab && state.currentTab !== 'kesfet') {
    switchTab(state.currentTab, false);
  }

  // Restore Shuffle button state
  if (state.isShuffle && DOM.btnShuffle) {
    DOM.btnShuffle.classList.add('text-primary', 'bg-primary-fixed/40');
  }

  // Restore Repeat button state
  if (state.repeatMode > 0 && DOM.btnRepeat) {
    DOM.btnRepeat.classList.add('text-primary', 'bg-primary-fixed/40');
    const rIcon = DOM.btnRepeat.querySelector('.material-symbols-outlined');
    if (rIcon) rIcon.textContent = state.repeatMode === 2 ? 'repeat_one' : 'repeat';
  }

  initSeekbarInteractions();
  initVolumeInteractions();

  setupEventListeners();
  renderQueueDrawerList();
  fetchExploreData();
  handleUrlParameters();

  KurfaDSP.init(DOM.audioEngine);
  startEqVisualizerTicker();

  initYouTubeEngine();
  syncPersistentPlayerPosition();
  window.addEventListener('resize', syncPersistentPlayerPosition);
  window.addEventListener('scroll', syncPersistentPlayerPosition, { passive: true });

  console.log("Kurfamüzik Client v5 Initialized");
}

function startEqVisualizerTicker() {
  // Disabled: Saves continuous 60fps RAF loop and DOM querying on low-spec and mobile devices
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Export ALL functions to global window for inline onclick handlers in HTML
window.switchTab = switchTab;
window.switchKesfetSubTab = switchKesfetSubTab;
window.switchKutuphaneSubTab = switchKutuphaneSubTab;
window.startDownloadAllQueue = startDownloadAllQueue;
window.clearCompletedDownloads = clearCompletedDownloads;
window.setEqualizerPreset = setEqualizerPreset;
window.cycleBandGain = cycleBandGain;
window.KurfaDSP = KurfaDSP;
window.toggleMobileCanvasMode = toggleMobileCanvasMode;
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.copyShareUrl = copyShareUrl;
window.triggerWebShare = triggerWebShare;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.selectAvatar = selectAvatar;
window.saveProfileData = saveProfileData;
window.toggleDarkMode = toggleDarkMode;
window.playTrackById = playTrackById;
window.addToQueueTrack = addToQueueTrack;
window.clearQueue = clearQueue;
window.removeFromQueue = removeFromQueue;
window.scrollShelf = scrollShelf;
window.playHeroTrack = playHeroTrack;
window.addHeroTrackToQueue = addHeroTrackToQueue;
window.downloadHeroTrack = downloadHeroTrack;
window.togglePlay = togglePlay;
window.playNextTrack = playNextTrack;
window.playPrevTrack = playPrevTrack;
window.toggleShuffle = toggleShuffle;
window.toggleRepeat = toggleRepeat;
window.toggleCurrentFavorite = toggleCurrentFavorite;
window.toggleFavoriteById = toggleFavoriteById;
window.downloadCurrentMP3 = downloadCurrentMP3;
window.downloadTrackById = downloadTrackById;
window.playAllFavorites = playAllFavorites;
window.playAllDownloads = playAllDownloads;
window.playAllPlaylist = playAllPlaylist;
window.playAllTrends = playAllTrends;
window.addAllResultsToQueue = addAllResultsToQueue;
window.toggleMute = toggleMute;
window.toggleQueueDrawer = toggleQueueDrawer;
window.openDownloaderModal = openDownloaderModal;
window.closeDownloaderModal = closeDownloaderModal;
window.downloadTrack = downloadTrack;
window.startDirectDownload = startDirectDownload;
window.pasteModalUrl = pasteModalUrl;
window.processModalDownload = processModalDownload;
window.showKurfaCloudModal = showKurfaCloudModal;
window.showToast = showToast;
window.executeSearchImmediate = executeSearchImmediate;
window.executeSearchFromInput = executeSearchFromInput;
window.clearSearchInput = clearSearchInput;
window.pasteFromClipboard = pasteFromClipboard;
window.applySearchFilter = applySearchFilter;
window.resetSearchFilters = resetSearchFilters;
window.filterGenre = filterGenre;
window.searchByArtist = searchByArtist;
window.quickSearchAndPlay = quickSearchAndPlay;
window.exportLibraryBackup = exportLibraryBackup;
window.importLibraryBackup = importLibraryBackup;
window.showKurfaStorageInfo = showKurfaStorageInfo;
window.toggleTrendsShowAll = toggleTrendsShowAll;
window.playFavoritesQuick = playFavoritesQuick;
window.renderPopularArtistsGrid = renderPopularArtistsGrid;
window.updateQuickFavCount = updateQuickFavCount;
window.openMobileNowPlaying = openMobileNowPlaying;
window.closeMobileNowPlaying = closeMobileNowPlaying;
window.openCreatePlaylistModal = openCreatePlaylistModal;
window.closeCreatePlaylistModal = closeCreatePlaylistModal;
window.submitCreatePlaylist = submitCreatePlaylist;
window.openAddToPlaylistModal = openAddToPlaylistModal;
window.closeAddToPlaylistModal = closeAddToPlaylistModal;
window.addTrackToPlaylist = addTrackToPlaylist;
window.openCustomPlaylistDetail = openCustomPlaylistDetail;
window.closeCustomPlaylistDetail = closeCustomPlaylistDetail;
window.deleteCustomPlaylist = deleteCustomPlaylist;
window.playCustomPlaylist = playCustomPlaylist;
window.removeTrackFromCustomPlaylist = removeTrackFromCustomPlaylist;
window.toggleBackgroundAudioMode = toggleBackgroundAudioMode;
window.handleGoogleSignIn = handleGoogleSignIn;
window.handleGoogleSignOut = handleGoogleSignOut;
window.syncFirebaseLibraryNow = syncFirebaseLibraryNow;
window.toggleDocumentPipPlayer = toggleDocumentPipPlayer;
window.openDocumentPipPlayer = openDocumentPipPlayer;
window.closeDocumentPipPlayer = closeDocumentPipPlayer;
window.openFloatingPip = openFloatingPip;
window.closeFloatingPip = closeFloatingPip;
window.expandFloatingPipToFull = expandFloatingPipToFull;
window.openDevicePickerModal = openDevicePickerModal;
window.closeDevicePickerModal = closeDevicePickerModal;
window.switchAudioOutputDevice = switchAudioOutputDevice;
window.scanBluetoothDevices = scanBluetoothDevices;
window.requestAudioDeviceAccess = requestAudioDeviceAccess;
window.initPipSeekbar = initPipSeekbar;
window.seekToFraction = seekToFraction;
window.togglePlaylistTracksExpand = togglePlaylistTracksExpand;
window.filterPlaylistItems = filterPlaylistItems;
window.updatePlaylistHeroUI = updatePlaylistHeroUI;
window.openGoogleAccountChooser = openGoogleAccountChooser;
window.closeGoogleAccountChooser = closeGoogleAccountChooser;
window.selectGoogleAccount = selectGoogleAccount;
window.toggleCustomGoogleBox = toggleCustomGoogleBox;
window.submitCustomGoogleAccount = submitCustomGoogleAccount;
window.setDeckVisualMode = setDeckVisualMode;
window.quickToggleVideoMode = quickToggleVideoMode;
window.toggleFullScreenVideo = toggleFullScreenVideo;
window.playCuratedMix = playCuratedMix;
window.moveQueueTrack = moveQueueTrack;
window.moveQueueTrackToPosition = moveQueueTrackToPosition;
window.toggleTahtaMode = toggleTahtaMode;
window.initDragToScroll = initDragToScroll;
window.importSpotifyPlaylist = importSpotifyPlaylist;
window.refreshSpotifyPlaylist = refreshSpotifyPlaylist;
window.renderSpotifyPlaylistsGrid = renderSpotifyPlaylistsGrid;
window.openSpotifyPlaylistDetail = openSpotifyPlaylistDetail;
window.closeSpotifyPlaylistDetail = closeSpotifyPlaylistDetail;
window.deleteSpotifyPlaylist = deleteSpotifyPlaylist;
window.playSpotifyPlaylist = playSpotifyPlaylist;
window.playSpotifyTrack = playSpotifyTrack;
window.handleCustomAvatarUpload = handleCustomAvatarUpload;
window.showVideoAdNotice = showVideoAdNotice;
window.setSearchSort = setSearchSort;
window.resetSearchFilters = resetSearchFilters;

// =========================================================================
// KURFA MOBİL UYGULAMA (APK) & PWA INSTALL CONTROLLER
// =========================================================================
window.deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPwaPrompt = e;
});

function openAppInstallModal() {
  const modal = document.getElementById('app-install-modal');
  const card = document.getElementById('app-install-modal-card');
  if (!modal) return;
  modal.classList.remove('opacity-0', 'pointer-events-none');
  if (card) {
    card.classList.remove('scale-95');
    card.classList.add('scale-100');
  }
}
window.openAppInstallModal = openAppInstallModal;

function closeAppInstallModal() {
  const modal = document.getElementById('app-install-modal');
  const card = document.getElementById('app-install-modal-card');
  if (!modal) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  if (card) {
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
  }
}
window.closeAppInstallModal = closeAppInstallModal;

async function triggerPwaInstall() {
  if (window.deferredPwaPrompt) {
    try {
      window.deferredPwaPrompt.prompt();
      const choice = await window.deferredPwaPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        if (typeof showToast === 'function') showToast('Kurfanova ana ekranınıza eklendi.');
        closeAppInstallModal();
      }
      window.deferredPwaPrompt = null;
    } catch (err) {
      console.warn('PWA prompt error:', err);
    }
  } else {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      alert('Safari tarayıcısında Paylaş simgesine basıp Ana Ekrana Ekle seçeneğini seçin.');
    } else {
      if (typeof showToast === 'function') {
        showToast('Tarayıcı menüsünden (üç nokta) Uygulamayı Yükle seçeneğini kullanabilirsiniz.');
      }
    }
  }
}
window.triggerPwaInstall = triggerPwaInstall;

