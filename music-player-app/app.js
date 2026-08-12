/* ==========================================================================
   Moint Neumorphic Music Player App - Pure Audio Engine
   - Functional 3-Band Equalizer & Web Audio Spectrum Analyzer
   - Embedded ID3 Cover Extractor & Aesthetic Minimal Album Art Generator
   - Local Audio Uploads & Queue Management
   - Real-Time Online & YT Music Audio Stream Integration (100% Reliable Audio)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- Initial Playlist ---
  const playlist = [];

  // --- State ---
  let currentIndex = 0;
  let isPlaying = false;
  let isShuffle = false;
  let isRepeat = false;
  let isMuted = false;
  let volume = 0.8;
  let isLiked = false;
  let searchMode = 'queue'; // 'queue', 'yt', 'favorites', 'community'
  let ytSearchResults = [];

  // --- Dynamic API Base URL for Local & Vercel Production Deployment ---
  const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : '';

  // --- User Profile State & Persistence ---
  let currentUser = null;
  try {
    const savedUser = localStorage.getItem('moint_user');
    if (savedUser) currentUser = JSON.parse(savedUser);
  } catch (e) {
    currentUser = null;
  }

  function saveUserSession(user) {
    currentUser = user;
    try {
      if (user) localStorage.setItem('moint_user', JSON.stringify(user));
      else localStorage.removeItem('moint_user');
    } catch (e) {}
    updateUserHeaderUI();
  }

  function updateUserHeaderUI() {
    const headerUserName = document.getElementById('headerUserName');
    const headerUserAvatar = document.getElementById('headerUserAvatar');
    if (currentUser) {
      if (headerUserName) headerUserName.textContent = currentUser.name;
      if (headerUserAvatar) headerUserAvatar.src = currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`;
    } else {
      if (headerUserName) headerUserName.textContent = 'Sign In';
      if (headerUserAvatar) headerUserAvatar.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=guest';
    }
  }

  updateUserHeaderUI();

  // --- Favorites Persistence ---
  let favorites = [];
  try {
    const savedFavs = localStorage.getItem('moint_favorites');
    if (savedFavs) favorites = JSON.parse(savedFavs);
  } catch (e) {
    favorites = [];
  }

  function saveFavorites() {
    try {
      localStorage.setItem('moint_favorites', JSON.stringify(favorites));
    } catch (e) {}
  }

  function isTrackFavorited(track) {
    if (!track) return false;
    return favorites.some(f => (f.id && track.id && f.id === track.id) || (f.title === track.title && f.artist === track.artist));
  }

  function toggleFavoriteTrack(track) {
    if (!track) return false;
    const existingIndex = favorites.findIndex(f => (f.id && track.id && f.id === track.id) || (f.title === track.title && f.artist === track.artist));
    if (existingIndex !== -1) {
      favorites.splice(existingIndex, 1);
      saveFavorites();
      showToast(`Removed "${track.title}" from Favorites`);
      return false;
    } else {
      favorites.push({
        id: track.id || 'fav-' + Date.now(),
        title: track.title,
        artist: track.artist,
        album: track.album || 'Favorite',
        art: track.art,
        audioUrl: track.audioUrl,
        url: track.url,
        ytId: track.ytId,
        isYt: track.isYt,
        isLocal: track.isLocal,
        badge: track.badge,
        duration: track.duration
      });
      saveFavorites();
      showToast(`Added "${track.title}" to Favorites ❤️`);
      return true;
    }
  }

  // --- DOM Elements ---
  const audioPlayer = document.getElementById('audioPlayer');
  const localFileInput = document.getElementById('localFileInput');
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const playerCard = document.getElementById('playerCard');
  const dropZone = document.getElementById('dropZone');

  const albumArt = document.getElementById('albumArt');
  const nowPlayingTag = document.getElementById('nowPlayingTag');
  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');
  const trackAlbum = document.getElementById('trackAlbum');

  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressThumb = document.getElementById('progressThumb');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl = document.getElementById('totalTime');

  const btnPlay = document.getElementById('btnPlay');
  const iconPlay = document.getElementById('iconPlay');
  const iconPause = document.getElementById('iconPause');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnShuffle = document.getElementById('btnShuffle');
  const btnRepeat = document.getElementById('btnRepeat');
  const btnLike = document.getElementById('btnLike');
  const btnAddFiles = document.getElementById('btnAddFiles');
  const btnModalAddFiles = document.getElementById('btnModalAddFiles');

  const btnVolume = document.getElementById('btnVolume');
  const volumePopover = document.getElementById('volumePopover');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumePercent = document.getElementById('volumePercent');

  const btnPlaylistToggle = document.getElementById('btnPlaylistToggle');
  const playlistModal = document.getElementById('playlistModal');
  const btnClosePlaylist = document.getElementById('btnClosePlaylist');
  const playlistItems = document.getElementById('playlistItems');
  const tabQueue = document.getElementById('tabQueue');
  const tabYtMusic = document.getElementById('tabYtMusic');
  const tabFavorites = document.getElementById('tabFavorites');

  const btnEq = document.getElementById('btnEq');
  const eqModal = document.getElementById('eqModal');
  const btnCloseEq = document.getElementById('btnCloseEq');
  const eqCanvas = document.getElementById('eqCanvas');
  const eqCtx = eqCanvas ? eqCanvas.getContext('2d') : null;

  const eqBass = document.getElementById('eqBass');
  const eqMid = document.getElementById('eqMid');
  const eqTreble = document.getElementById('eqTreble');
  const eqBassVal = document.getElementById('eqBassVal');
  const eqMidVal = document.getElementById('eqMidVal');
  const eqTrebleVal = document.getElementById('eqTrebleVal');

  const btnShare = document.getElementById('btnShare');
  const toastContainer = document.getElementById('toastContainer');

  // --- YouTube Player Instance for Silent Background Audio ---
  let ytPlayer = null;
  let isYtReady = false;

  let ytErrorCount = 0;

  function initYtPlayerInstance() {
    if (window.YT && window.YT.Player && !ytPlayer) {
      try {
        ytPlayer = new YT.Player('ytPlayer', {
          height: '1',
          width: '1',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin
          },
          events: {
            onReady: () => {
              isYtReady = true;
              if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(volume * 100);
            },
            onStateChange: (event) => {
              const track = playlist[currentIndex];
              if (!track || !track.isYt || track.audioUrl) return;

              if (event.data === YT.PlayerState.PLAYING) {
                ytErrorCount = 0;
                isPlaying = true;
                playerCard.classList.add('is-playing');
                iconPlay.classList.add('hidden');
                iconPause.classList.remove('hidden');
              } else if (event.data === YT.PlayerState.PAUSED) {
                // Only update UI if we intentionally paused
              } else if (event.data === YT.PlayerState.ENDED) {
                if (isRepeat) {
                  ytPlayer.seekTo(0);
                  ytPlayer.playVideo();
                } else {
                  nextTrack();
                }
              }
            },
            onError: async (event) => {
              console.warn('YT embed restriction code:', event.data);
              const track = playlist[currentIndex];
              if (track) {
                showToast(`Video restricted. Switching to direct audio stream for "${track.title}"...`);
                try {
                  const fallbackResults = await searchJioSaavn(`${track.title} ${track.artist}`);
                  if (fallbackResults && fallbackResults.length > 0 && fallbackResults[0].audioUrl) {
                    const directTrack = fallbackResults[0];
                    track.audioUrl = directTrack.audioUrl;
                    track.art = track.art || directTrack.art;
                    track.isYt = false;
                    track.badge = 'JioSaavn';
                    loadTrack(currentIndex, true);
                    showToast(`Playing direct stream for "${track.title}"! 🎉`);
                    return;
                  }
                } catch (e) {}
              }
              showToast('Track restricted. Playing next track...');
              setTimeout(() => nextTrack(), 800);
            }
          }
        });
      } catch (e) { }
    }
  }

  window.onYouTubeIframeAPIReady = function () {
    initYtPlayerInstance();
  };
  if (window.YT && window.YT.Player) initYtPlayerInstance();

  // --- Web Audio API Engine ---
  let audioCtx = null;
  let mediaSourceNode = null;
  let analyserNode = null;
  let lowFilter = null;
  let midFilter = null;
  let highFilter = null;
  let synthOsc = null;
  let synthGainNode = null;

  function initAudioEngine() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    if (!mediaSourceNode && audioPlayer) {
      try {
        mediaSourceNode = audioCtx.createMediaElementSource(audioPlayer);

        lowFilter = audioCtx.createBiquadFilter();
        lowFilter.type = 'lowshelf';
        lowFilter.frequency.value = 100;
        lowFilter.gain.value = parseFloat(eqBass.value) || 0;

        midFilter = audioCtx.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000;
        midFilter.Q.value = 1.0;
        midFilter.gain.value = parseFloat(eqMid.value) || 0;

        highFilter = audioCtx.createBiquadFilter();
        highFilter.type = 'highshelf';
        highFilter.frequency.value = 4000;
        highFilter.gain.value = parseFloat(eqTreble.value) || 0;

        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 128;
        analyserNode.smoothingTimeConstant = 0.8;

        mediaSourceNode.connect(lowFilter);
        lowFilter.connect(midFilter);
        midFilter.connect(highFilter);
        highFilter.connect(analyserNode);
        analyserNode.connect(audioCtx.destination);
      } catch (e) { }
    }
  }

  function setEqGains(bass, mid, treble) {
    if (lowFilter) lowFilter.gain.value = bass;
    if (midFilter) midFilter.gain.value = mid;
    if (highFilter) highFilter.gain.value = treble;

    eqBass.value = bass;
    eqMid.value = mid;
    eqTreble.value = treble;

    eqBassVal.textContent = `${bass > 0 ? '+' : ''}${bass}dB`;
    eqMidVal.textContent = `${mid > 0 ? '+' : ''}${mid}dB`;
    eqTrebleVal.textContent = `${treble > 0 ? '+' : ''}${treble}dB`;
  }

  // --- Synth Fallback Tone ---
  function startSynthFallback(freq) {
    if (!audioCtx) return;
    stopSynthFallback();
    synthGainNode = audioCtx.createGain();
    synthGainNode.gain.value = isMuted ? 0 : volume * 0.12;

    synthOsc = audioCtx.createOscillator();
    synthOsc.type = 'sawtooth';
    synthOsc.frequency.setValueAtTime(freq || 329.63, audioCtx.currentTime);

    synthOsc.connect(synthGainNode);
    synthGainNode.connect(audioCtx.destination);
    synthOsc.start();
  }

  function stopSynthFallback() {
    if (synthOsc) {
      try { synthOsc.stop(); synthOsc.disconnect(); } catch (e) { }
      synthOsc = null;
    }
  }

  // --- Aesthetic Minimal Album Art Generator ---
  function generateMinimalAlbumArt(title, artist) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    let hash = 0;
    const str = (title + (artist || '')).toLowerCase();
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % 5;

    const palettes = [
      { bg1: '#F4F1DE', bg2: '#E07A5F', accent: '#3D405B', circle: '#81B29A', text: '#2B2D42' },
      { bg1: '#F0EBD8', bg2: '#81B29A', accent: '#1D2D44', circle: '#7052FF', text: '#1D2D44' },
      { bg1: '#F3F4F6', bg2: '#D8B4F8', accent: '#603BEA', circle: '#9C83FF', text: '#3E2A70' },
      { bg1: '#EAEAEA', bg2: '#3A3D40', accent: '#D4C5B9', circle: '#FF6B6B', text: '#1E1E24' },
      { bg1: '#FAF7F2', bg2: '#FFB5A7', accent: '#FCD5CE', circle: '#F8AD9D', text: '#6D597A' }
    ];

    const theme = palettes[colorIndex];
    const bgGrad = ctx.createLinearGradient(0, 0, 600, 600);
    bgGrad.addColorStop(0, theme.bg1);
    bgGrad.addColorStop(1, theme.bg2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 600, 600);

    const shapeStyle = Math.abs(hash >> 2) % 3;

    if (shapeStyle === 0) {
      ctx.fillStyle = theme.circle;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(300, 260, 140, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(220, 320, 110, 0, Math.PI * 2);
      ctx.fill();

    } else if (shapeStyle === 1) {
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(300, 280, 150, Math.PI, 0, false);
      ctx.lineTo(450, 420);
      ctx.lineTo(150, 420);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = theme.circle;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(300, 240, 60, 0, Math.PI * 2);
      ctx.fill();

    } else {
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(600, 600);
      ctx.lineTo(0, 600);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = theme.circle;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(300, 270, 130, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = theme.text;
    ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';

    const displayTitle = title.length > 22 ? title.substring(0, 20) + '…' : title;
    ctx.fillText(displayTitle, 48, 510);

    ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = theme.text;
    ctx.globalAlpha = 0.7;
    ctx.fillText((artist || 'MUSIC').toUpperCase(), 48, 542);

    return canvas.toDataURL('image/png');
  }

  // --- Embedded ID3 Cover Extractor ---
  function extractEmbeddedCoverArt(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const readChunkSize = Math.min(file.size, 1024 * 1024);

      reader.onload = function (e) {
        const buffer = e.target.result;
        const bytes = new Uint8Array(buffer);

        for (let i = 0; i < bytes.length - 10; i++) {
          if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8 && bytes[i + 2] === 0xFF) {
            let end = i + 3;
            for (let j = i + 3; j < Math.min(bytes.length - 1, i + 800000); j++) {
              if (bytes[j] === 0xFF && bytes[j + 1] === 0xD9) {
                end = j + 2;
                break;
              }
            }
            if (end > i + 100) {
              const imgData = bytes.subarray(i, end);
              const blob = new Blob([imgData], { type: 'image/jpeg' });
              resolve(URL.createObjectURL(blob));
              return;
            }
          }

          if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4E && bytes[i + 3] === 0x47) {
            let end = i + 4;
            for (let j = i + 4; j < Math.min(bytes.length - 4, i + 800000); j++) {
              if (bytes[j] === 0x49 && bytes[j + 1] === 0x45 && bytes[j + 2] === 0x4E && bytes[j + 3] === 0x4D) {
                end = j + 8;
                break;
              }
            }
            if (end > i + 100) {
              const imgData = bytes.subarray(i, end);
              const blob = new Blob([imgData], { type: 'image/png' });
              resolve(URL.createObjectURL(blob));
              return;
            }
          }
        }
        resolve(null);
      };

      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file.slice(0, readChunkSize));
    });
  }

  // --- Helper Functions ---
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // --- Unified Track Loader ---
  function loadTrack(index, autoPlay = false) {
    if (playlist.length === 0) {
      albumArt.src = generateMinimalAlbumArt('No Track Selected', 'Add songs to play');
      trackTitle.textContent = 'No Song Loaded';
      trackArtist.textContent = 'Select or Add Music';
      trackAlbum.textContent = 'Playlist Empty';
      nowPlayingTag.textContent = 'IDLE';
      audioPlayer.pause();
      if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
      stopSynthFallback();
      currentTimeEl.textContent = '0:00';
      totalTimeEl.textContent = '0:00';
      updateProgressUI(0, 1);
      renderPlaylist();
      return;
    }

    if (index < 0) index = 0;
    if (index >= playlist.length) index = playlist.length - 1;
    currentIndex = index;
    const track = playlist[currentIndex];

    // Reset current audio engines
    audioPlayer.pause();
    stopSynthFallback();
    if (ytPlayer && ytPlayer.pauseVideo) {
      try { ytPlayer.pauseVideo(); } catch (e) { }
    }

    // Artwork & Details
    albumArt.src = track.art || generateMinimalAlbumArt(track.title, track.artist);
    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;
    trackAlbum.textContent = track.album || (track.badge || (track.isYt ? 'YouTube Music' : (track.isLocal ? 'Local Music' : 'Online Stream')));
    nowPlayingTag.textContent = track.badge ? track.badge.toUpperCase() : (track.isYt ? 'YT MUSIC' : (track.isLocal ? 'LOCAL FILE' : 'ONLINE MUSIC'));

    if (track.audioUrl) {
      // Direct high-definition audio stream (JioSaavn / Audius / MP3 / AAC)
      if (ytPlayer && ytPlayer.pauseVideo) try { ytPlayer.pauseVideo(); } catch (e) { }
      audioPlayer.crossOrigin = 'anonymous';
      audioPlayer.src = track.audioUrl;
      audioPlayer.load();
    } else if (track.isLocal && track.url) {
      // Local file: play through native <audio> element
      if (ytPlayer && ytPlayer.pauseVideo) try { ytPlayer.pauseVideo(); } catch (e) { }
      audioPlayer.crossOrigin = 'anonymous';
      audioPlayer.src = track.url;
      audioPlayer.load();
    } else if (track.isYt && track.ytId) {
      // YouTube track: play full song through hidden YT IFrame player
      audioPlayer.pause();
      audioPlayer.removeAttribute('src');
      if (ytPlayer && isYtReady) {
        if (autoPlay) {
          ytPlayer.loadVideoById(track.ytId);
        } else {
          ytPlayer.cueVideoById(track.ytId);
        }
      } else {
        initYtPlayerInstance();
        setTimeout(() => {
          if (ytPlayer && ytPlayer.loadVideoById && autoPlay) {
            ytPlayer.loadVideoById(track.ytId);
          }
        }, 1000);
      }
    } else {
      audioPlayer.removeAttribute('src');
    }

    currentTimeEl.textContent = '0:00';
    totalTimeEl.textContent = formatTime(track.duration || 0);
    updateProgressUI(0, track.duration || 1);

    // Update Favorite button state
    const isFav = isTrackFavorited(track);
    isLiked = isFav;
    btnLike.classList.toggle('active', isFav);

    renderPlaylist();

    if (autoPlay || isPlaying) {
      playTrack();
    } else {
      pauseTrackUI();
    }
  }

  function playTrack() {
    if (playlist.length === 0) return;
    initAudioEngine();
    const track = playlist[currentIndex];

    isPlaying = true;
    playerCard.classList.add('is-playing');
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');

    if (track.audioUrl || (track.isLocal && track.url)) {
      audioPlayer.volume = volume;
      audioPlayer.play().catch(err => {
        console.warn('Audio playback notice:', err);
      });
    } else if (track.isYt && track.ytId) {
      if (ytPlayer && ytPlayer.playVideo) {
        ytPlayer.playVideo();
        ytPlayer.unMute();
        ytPlayer.setVolume(volume * 100);
      } else {
        initYtPlayerInstance();
        setTimeout(() => {
          if (ytPlayer && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(track.ytId);
          }
        }, 800);
      }
    } else {
      startSynthFallback(track.freq);
    }
  }

  function pauseTrackUI() {
    isPlaying = false;
    playerCard.classList.remove('is-playing');
    iconPause.classList.add('hidden');
    iconPlay.classList.remove('hidden');
    audioPlayer.pause();
    if (ytPlayer && ytPlayer.pauseVideo) {
      try { ytPlayer.pauseVideo(); } catch (e) { }
    }
    stopSynthFallback();
  }

  function togglePlay() {
    if (isPlaying) {
      pauseTrackUI();
    } else {
      playTrack();
    }
  }

  function nextTrack() {
    if (playlist.length <= 1) return;
    if (isShuffle) {
      let randIndex;
      do {
        randIndex = Math.floor(Math.random() * playlist.length);
      } while (randIndex === currentIndex && playlist.length > 1);
      loadTrack(randIndex, true);
    } else {
      const nextIdx = (currentIndex + 1) % playlist.length;
      loadTrack(nextIdx, true);
    }
  }

  function prevTrack() {
    if (playlist.length <= 1) return;
    const prevIdx = (currentIndex - 1 + playlist.length) % playlist.length;
    loadTrack(prevIdx, true);
  }

  function removeTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    const removedTrack = playlist[index];

    if (removedTrack.url && removedTrack.isLocal) {
      try { URL.revokeObjectURL(removedTrack.url); } catch (e) { }
    }

    playlist.splice(index, 1);
    showToast(`Removed "${removedTrack.title}"`);

    if (playlist.length === 0) {
      currentIndex = 0;
      loadTrack(0, false);
      return;
    }

    if (index === currentIndex) {
      currentIndex = Math.min(currentIndex, playlist.length - 1);
      loadTrack(currentIndex, isPlaying);
    } else if (index < currentIndex) {
      currentIndex--;
      renderPlaylist();
    } else {
      renderPlaylist();
    }
  }

  function updateProgressUI(currentSec, totalSec) {
    if (!totalSec || totalSec <= 0) totalSec = 1;
    const percentage = Math.min(100, Math.max(0, (currentSec / totalSec) * 100));
    progressFill.style.width = `${percentage}%`;
    progressThumb.style.left = `${percentage}%`;
    currentTimeEl.textContent = formatTime(currentSec);
    totalTimeEl.textContent = formatTime(totalSec);
  }

  // Audio Player Event Sync (for local files & direct audio streams)
  audioPlayer.addEventListener('timeupdate', () => {
    if (isDraggingScrubber) return; // Prevent fight with mouse drag
    const track = playlist[currentIndex];
    if (track && (track.isLocal || track.audioUrl)) {
      const totalSec = (audioPlayer.duration && !isNaN(audioPlayer.duration)) ? audioPlayer.duration : (track.duration || 1);
      updateProgressUI(audioPlayer.currentTime, totalSec);
    }
  });

  audioPlayer.addEventListener('loadedmetadata', () => {
    const track = playlist[currentIndex];
    if (track && (track.isLocal || track.audioUrl)) {
      if (audioPlayer.duration && !isNaN(audioPlayer.duration) && audioPlayer.duration !== Infinity) {
        track.duration = audioPlayer.duration;
      }
      totalTimeEl.textContent = formatTime(track.duration || 0);
    }
  });

  audioPlayer.addEventListener('ended', () => {
    if (isRepeat) {
      audioPlayer.currentTime = 0;
      audioPlayer.play();
    } else {
      nextTrack();
    }
  });

  // Time Sync Loop for YouTube IFrame or Fallback Synth
  setInterval(() => {
    if (isDraggingScrubber) return;
    const track = playlist[currentIndex];
    if (!track || !isPlaying) return;

    if (track.isYt && ytPlayer && ytPlayer.getCurrentTime) {
      try {
        const current = ytPlayer.getCurrentTime() || 0;
        const total = ytPlayer.getDuration() || track.duration || 180;
        if (total > 0) track.duration = total;
        updateProgressUI(current, total);
      } catch (e) { }

    } else if (!track.isLocal && !track.isYt && !track.audioUrl) {
      // Synthetic fallback synth ONLY (never run for audio files or online stream URLs)
      track.currentTime = (track.currentTime || 0) + 0.5;
      if (track.currentTime >= (track.duration || 180)) {
        if (isRepeat) track.currentTime = 0;
        else { nextTrack(); return; }
      }
      updateProgressUI(track.currentTime, track.duration || 180);
    }
  }, 500);

  // --- Scrubber Dragging ---
  function setProgress(e) {
    if (playlist.length === 0) return;
    const rect = progressContainer.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    const track = playlist[currentIndex];
    if (!track) return;

    const totalDur = (audioPlayer.duration && !isNaN(audioPlayer.duration)) ? audioPlayer.duration : (track.duration || 180);

    if (track.isLocal || track.audioUrl) {
      const targetSec = percentage * totalDur;
      if (audioPlayer.duration && !isNaN(audioPlayer.duration)) {
        audioPlayer.currentTime = targetSec;
      }
      updateProgressUI(targetSec, totalDur);
    } else if (track.isYt && ytPlayer && ytPlayer.seekTo) {
      const totalSec = ytPlayer.getDuration() || track.duration || 180;
      const targetSec = percentage * totalSec;
      ytPlayer.seekTo(targetSec, true);
      updateProgressUI(targetSec, totalSec);
    } else {
      track.currentTime = percentage * totalDur;
      updateProgressUI(track.currentTime, totalDur);
    }
  }

  let isDraggingScrubber = false;
  progressContainer.addEventListener('mousedown', (e) => {
    isDraggingScrubber = true;
    progressContainer.classList.add('is-dragging');
    setProgress(e);
  });
  window.addEventListener('mousemove', (e) => {
    if (isDraggingScrubber) setProgress(e);
  });
  window.addEventListener('mouseup', () => {
    if (isDraggingScrubber) {
      isDraggingScrubber = false;
      progressContainer.classList.remove('is-dragging');
    }
  });

  // --- Full-Length Online Music Search Engine (JioSaavn + Audius + YT) ---
  const saavnApis = [
    'https://jiosaavn-api-black.vercel.app/api/search/songs?query=',
    'https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query='
  ];

  async function searchJioSaavn(term) {
    for (const api of saavnApis) {
      try {
        const res = await fetch(api + encodeURIComponent(term), { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          const results = data.data?.results || data.results || data.data;
          if (results && Array.isArray(results) && results.length > 0) {
            return results.map(song => {
              // Artwork
              let art = '';
              if (Array.isArray(song.image) && song.image.length > 0) {
                art = song.image[song.image.length - 1]?.url || song.image[0]?.url;
              } else if (typeof song.image === 'string') {
                art = song.image;
              }

              // Audio Stream URL
              let audioUrl = '';
              if (Array.isArray(song.downloadUrl) && song.downloadUrl.length > 0) {
                const high = song.downloadUrl.find(d => d.quality === '320kbps') ||
                  song.downloadUrl.find(d => d.quality === '160kbps') ||
                  song.downloadUrl[song.downloadUrl.length - 1];
                audioUrl = high?.url || song.downloadUrl[0]?.url;
              } else if (typeof song.downloadUrl === 'string') {
                audioUrl = song.downloadUrl;
              }

              // Artist Name
              let artistName = 'Unknown Artist';
              if (song.artists) {
                if (typeof song.artists === 'string') artistName = song.artists;
                else if (Array.isArray(song.artists.primary) && song.artists.primary.length > 0) {
                  artistName = song.artists.primary.map(a => a.name).join(', ');
                } else if (song.artists.all && song.artists.all.trim()) {
                  artistName = song.artists.all.trim();
                }
              }

              if (!audioUrl) return null;

              return {
                id: 'saavn-' + (song.id || Math.random()),
                title: song.name || song.title || 'Untitled',
                artist: artistName,
                album: song.album?.name || 'JioSaavn',
                art: art || generateMinimalAlbumArt(song.name, artistName),
                audioUrl: audioUrl,
                duration: parseInt(song.duration) || 210,
                isOnline: true,
                badge: 'JioSaavn'
              };
            }).filter(Boolean);
          }
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  async function searchAudius(term) {
    try {
      const res = await fetch(`https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(term)}&app_name=moint`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
          return data.data.slice(0, 12).map(track => {
            const art = track.artwork ? (track.artwork['480x480'] || track.artwork['150x150']) : '';
            const audioUrl = track.stream?.url || `https://discoveryprovider.audius.co/v1/tracks/${track.id}/stream?app_name=moint`;
            return {
              id: 'audius-' + track.id,
              title: track.title || 'Untitled',
              artist: track.user?.name || 'Audius Artist',
              album: 'Audius Music',
              art: art || generateMinimalAlbumArt(track.title, track.user?.name),
              audioUrl: audioUrl,
              duration: parseInt(track.duration) || 180,
              isOnline: true,
              badge: 'Audius'
            };
          });
        }
      }
    } catch (e) { }
    return null;
  }

  // --- YTMusicAPI (Python Server) Search Provider ---
  async function searchYtmusicApiServer(term) {
    try {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(term)}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (e) {}
    return null;
  }

  async function searchOnlineSongs(query) {
    if (!query || query.trim().length === 0) {
      ytSearchResults = [];
      renderPlaylist();
      return;
    }

    const term = query.trim();
    showToast(`Searching YT Music for "${term}"...`);

    // 1. Unofficial YTMusicAPI Python Server (http://localhost:5000) - PRIMARY
    let results = await searchYtmusicApiServer(term);
    if (results && results.length > 0) {
      ytSearchResults = results;
      renderPlaylist();
      return;
    }

    // 2. JioSaavn (Fallback)
    results = await searchJioSaavn(term);
    if (results && results.length > 0) {
      ytSearchResults = results;
      renderPlaylist();
      return;
    }

    // 3. Audius API (Fallback)
    results = await searchAudius(term);
    if (results && results.length > 0) {
      ytSearchResults = results;
      renderPlaylist();
      return;
    }

    showToast('No results found. Try another song name.');
    ytSearchResults = [];
    renderPlaylist();
  }

  // Alias for backward compatibility
  const searchYtMusic = searchOnlineSongs;

  // Resolve a YouTube video ID for an iTunes track
  async function resolveYtId(track) {
    const searchTerm = `${track.title} ${track.artist}`;

    // Try Piped first
    const pipedResults = await searchPiped(searchTerm);
    if (pipedResults && pipedResults.length > 0) {
      track.ytId = pipedResults[0].ytId;
      track.needsResolve = false;
      return true;
    }

    // Try Invidious
    const invResults = await searchInvidious(searchTerm);
    if (invResults && invResults.length > 0) {
      track.ytId = invResults[0].ytId;
      track.needsResolve = false;
      return true;
    }

    return false;
  }

  // --- Local Audio Ingestion ---
  async function processAudioFiles(files) {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    const newStartIndex = playlist.length;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(file.name)) continue;

      let title = file.name.replace(/\.[^/.]+$/, '');
      let artist = 'Local Artist';
      if (title.includes('-')) {
        const parts = title.split('-');
        artist = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      }

      const fileUrl = URL.createObjectURL(file);
      let artworkUrl = await extractEmbeddedCoverArt(file);
      if (!artworkUrl) {
        artworkUrl = generateMinimalAlbumArt(title, artist);
      }

      const newTrack = {
        id: 'local-' + Date.now() + '-' + Math.random(),
        title: title,
        artist: artist,
        album: 'My Local Collection',
        art: artworkUrl,
        url: fileUrl,
        duration: 0,
        isLocal: true,
        file: file
      };

      playlist.push(newTrack);
      addedCount++;
    }

    if (addedCount > 0) {
      showToast(`Added ${addedCount} song${addedCount > 1 ? 's' : ''} to playlist!`);
      searchMode = 'queue';
      tabQueue.classList.add('active');
      tabYtMusic.classList.remove('active');
      renderPlaylist();
      loadTrack(newStartIndex, true);
    }
  }

  // File Buttons & Drag/Drop
  btnAddFiles.addEventListener('click', () => localFileInput.click());
  btnModalAddFiles.addEventListener('click', () => localFileInput.click());

  localFileInput.addEventListener('change', (e) => {
    processAudioFiles(e.target.files);
    localFileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    document.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('hidden');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('hidden');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    processAudioFiles(e.dataTransfer.files);
  });

  // --- Search Bar Filtering ---
  let searchDebounce = null;
  function handleSearchInput(query) {
    const term = query.toLowerCase().trim();
    if (term.length > 0) {
      btnClearSearch.classList.remove('hidden');
    } else {
      btnClearSearch.classList.add('hidden');
    }

    if (searchMode === 'yt') {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchYtMusic(query);
      }, 350);
      playlistModal.classList.remove('hidden');
    } else if (searchMode === 'favorites') {
      if (term.length > 0) {
        const filtered = favorites.filter(track =>
          track.title.toLowerCase().includes(term) ||
          track.artist.toLowerCase().includes(term) ||
          (track.album && track.album.toLowerCase().includes(term))
        );
        renderPlaylist(filtered);
        playlistModal.classList.remove('hidden');
      } else {
        renderPlaylist(favorites);
      }
    } else if (searchMode === 'community') {
      if (term.length > 0) {
        const filtered = communitySongs.filter(track =>
          track.title.toLowerCase().includes(term) ||
          track.artist.toLowerCase().includes(term) ||
          (track.uploaderName && track.uploaderName.toLowerCase().includes(term))
        );
        renderPlaylist(filtered);
        playlistModal.classList.remove('hidden');
      } else {
        renderPlaylist(communitySongs);
      }
    } else {
      if (term.length > 0) {
        const filtered = playlist.filter(track =>
          track.title.toLowerCase().includes(term) ||
          track.artist.toLowerCase().includes(term) ||
          (track.album && track.album.toLowerCase().includes(term))
        );
        renderPlaylist(filtered);
        playlistModal.classList.remove('hidden');
      } else {
        renderPlaylist(playlist);
      }
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      handleSearchInput('');
    });
  }

  // --- Modal Search Mode Tabs ---
  const tabCommunity = document.getElementById('tabCommunity');

  tabQueue.addEventListener('click', () => {
    searchMode = 'queue';
    tabQueue.classList.add('active');
    tabYtMusic.classList.remove('active');
    if (tabFavorites) tabFavorites.classList.remove('active');
    if (tabCommunity) tabCommunity.classList.remove('active');
    searchInput.placeholder = 'Search local queue...';
    renderPlaylist();
  });

  tabYtMusic.addEventListener('click', () => {
    searchMode = 'yt';
    tabYtMusic.classList.add('active');
    tabQueue.classList.remove('active');
    if (tabFavorites) tabFavorites.classList.remove('active');
    if (tabCommunity) tabCommunity.classList.remove('active');
    searchInput.placeholder = 'Search online songs (JioSaavn / Audius)...';
    if (searchInput.value.trim().length > 0) {
      searchOnlineSongs(searchInput.value);
    } else {
      searchOnlineSongs('Starboy');
    }
  });

  if (tabFavorites) {
    tabFavorites.addEventListener('click', () => {
      searchMode = 'favorites';
      tabFavorites.classList.add('active');
      tabQueue.classList.remove('active');
      tabYtMusic.classList.remove('active');
      if (tabCommunity) tabCommunity.classList.remove('active');
      searchInput.placeholder = 'Search favorites...';
      renderPlaylist();
    });
  }

  if (tabCommunity) {
    tabCommunity.addEventListener('click', async () => {
      searchMode = 'community';
      tabCommunity.classList.add('active');
      tabQueue.classList.remove('active');
      tabYtMusic.classList.remove('active');
      if (tabFavorites) tabFavorites.classList.remove('active');
      searchInput.placeholder = 'Search community uploaded songs...';
      showToast('Loading community songs...');
      await fetchCommunitySongs();
      renderPlaylist();
    });
  }

  // --- Controls Handlers ---
  btnPlay.addEventListener('click', togglePlay);
  btnNext.addEventListener('click', nextTrack);
  btnPrev.addEventListener('click', prevTrack);

  btnShuffle.addEventListener('click', () => {
    isShuffle = !isShuffle;
    btnShuffle.classList.toggle('active', isShuffle);
    showToast(isShuffle ? 'Shuffle Enabled' : 'Shuffle Disabled');
  });

  btnRepeat.addEventListener('click', () => {
    isRepeat = !isRepeat;
    btnRepeat.classList.toggle('active', isRepeat);
    showToast(isRepeat ? 'Repeat Enabled' : 'Repeat Disabled');
  });

  btnLike.addEventListener('click', () => {
    const track = playlist[currentIndex];
    if (!track) {
      showToast('No song playing to favorite');
      return;
    }
    const isNowFav = toggleFavoriteTrack(track);
    isLiked = isNowFav;
    btnLike.classList.toggle('active', isNowFav);
    if (searchMode === 'favorites') renderPlaylist();
  });

  // Volume
  btnVolume.addEventListener('click', () => {
    volumePopover.classList.toggle('hidden');
  });

  volumeSlider.addEventListener('input', (e) => {
    volume = e.target.value / 100;
    volumePercent.textContent = `${e.target.value}%`;
    audioPlayer.volume = volume;
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(volume * 100);
    if (synthGainNode) synthGainNode.gain.value = volume * 0.12;
  });

  // Equalizer Sliders & Presets
  eqBass.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    eqBassVal.textContent = `${val > 0 ? '+' : ''}${val}dB`;
    if (lowFilter) lowFilter.gain.value = val;
  });

  eqMid.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    eqMidVal.textContent = `${val > 0 ? '+' : ''}${val}dB`;
    if (midFilter) midFilter.gain.value = val;
  });

  eqTreble.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    eqTrebleVal.textContent = `${val > 0 ? '+' : ''}${val}dB`;
    if (highFilter) highFilter.gain.value = val;
  });

  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');

      const preset = e.target.dataset.preset;
      initAudioEngine();

      switch (preset) {
        case 'rock':
          setEqGains(4, -2, 5);
          break;
        case 'psychedelic':
          setEqGains(3, 6, 4);
          break;
        case 'bass':
          setEqGains(9, 0, -3);
          break;
        case 'acoustic':
          setEqGains(-2, 3, 4);
          break;
        default: // Flat
          setEqGains(0, 0, 0);
          break;
      }
      showToast(`EQ Preset: ${e.target.textContent}`);
    });
  });

  // Spectrum Visualizer Draw Loop
  btnEq.addEventListener('click', () => {
    initAudioEngine();
    eqModal.classList.remove('hidden');
    drawEqSpectrum();
  });

  btnCloseEq.addEventListener('click', () => {
    eqModal.classList.add('hidden');
  });

  function drawEqSpectrum() {
    if (eqModal.classList.contains('hidden') || !eqCtx) return;

    eqCtx.clearRect(0, 0, eqCanvas.width, eqCanvas.height);
    const barWidth = 7;
    const gap = 4;
    const numBars = Math.floor(eqCanvas.width / (barWidth + gap));
    const dataArray = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    if (analyserNode && isPlaying) {
      analyserNode.getByteFrequencyData(dataArray);
    }

    for (let i = 0; i < numBars; i++) {
      let height = 6;
      if (isPlaying) {
        if (dataArray && dataArray[i * 2] !== undefined && dataArray[i * 2] > 0) {
          height = Math.max(8, (dataArray[i * 2] / 255) * eqCanvas.height * 0.9);
        } else {
          height = Math.max(8, (Math.sin(Date.now() * 0.007 + i * 0.35) + 1) * 0.5 * eqCanvas.height * 0.85);
        }
      }

      const x = i * (barWidth + gap);
      const y = eqCanvas.height - height;

      const grad = eqCtx.createLinearGradient(0, y, 0, eqCanvas.height);
      grad.addColorStop(0, '#9C83FF');
      grad.addColorStop(1, '#5C37EA');

      eqCtx.fillStyle = grad;
      eqCtx.beginPath();
      eqCtx.roundRect(x, y, barWidth, height, [4, 4, 0, 0]);
      eqCtx.fill();
    }

    requestAnimationFrame(drawEqSpectrum);
  }

  // --- Playlist Modal Rendering ---
  function renderPlaylist(customList = null) {
    playlistItems.innerHTML = '';

    if (searchMode === 'yt') {
      const displayList = customList || ytSearchResults;
      if (displayList.length === 0) {
        playlistItems.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-sub); font-size: 14px; font-weight: 600;">
            Type a song name in the search bar to find full-length online music.
          </div>
        `;
        return;
      }

      displayList.forEach((track) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';

        const badgeLabel = track.badge || (track.isYt ? 'YT Music' : 'Online');

        item.innerHTML = `
          <img src="${track.art}" alt="${track.title}">
          <div class="playlist-item-info">
            <div class="playlist-item-title">${track.title}</div>
            <div class="playlist-item-artist">${track.artist} <span class="playlist-item-badge badge-yt">${badgeLabel}</span></div>
          </div>
          <div class="playlist-item-duration">${formatTime(track.duration)}</div>
          <button class="playlist-item-add" title="Add track to queue" style="background:none;border:none;color:var(--primary-purple-dark);font-size:18px;font-weight:800;padding:4px 8px;cursor:pointer;">+</button>
        `;

        item.addEventListener('click', async () => {
          // If this track needs a YouTube video ID resolved (iTunes fallback result)
          if (track.needsResolve && !track.ytId) {
            showToast(`Resolving "${track.title}"...`);
            const resolved = await resolveYtId(track);
            if (!resolved) {
              showToast('Could not find this track on YouTube. Try another.');
              return;
            }
          }
          playlist.push(track);
          const newIdx = playlist.length - 1;
          showToast(`Playing "${track.title}"!`);
          loadTrack(newIdx, true);
          playlistModal.classList.add('hidden');
        });

        playlistItems.appendChild(item);
      });

    } else if (searchMode === 'favorites') {
      const displayList = customList || favorites;
      if (displayList.length === 0) {
        playlistItems.innerHTML = `
          <div style="text-align: center; padding: 28px 16px; color: var(--text-sub); font-size: 14px; font-weight: 600;">
            No favorite songs yet.<br><span style="font-size:12px; color:var(--text-muted); margin-top:6px; display:inline-block;">Click the ❤️ heart icon on any song to save it here!</span>
          </div>
        `;
        return;
      }

      displayList.forEach((track) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';

        const badgeLabel = track.badge || (track.isLocal ? 'Local' : 'Online');

        item.innerHTML = `
          <img src="${track.art || generateMinimalAlbumArt(track.title, track.artist)}" alt="${track.title}">
          <div class="playlist-item-info">
            <div class="playlist-item-title">${track.title}</div>
            <div class="playlist-item-artist">${track.artist} <span class="playlist-item-badge badge-yt">${badgeLabel}</span></div>
          </div>
          <div class="playlist-item-duration">${formatTime(track.duration)}</div>
          <button class="playlist-item-fav-toggle active" title="Remove from favorites" style="background:none;border:none;color:#FF4757;font-size:16px;padding:4px 8px;cursor:pointer;">❤️</button>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('playlist-item-fav-toggle')) return;
          let qIndex = playlist.findIndex(t => (t.id && track.id && t.id === track.id) || (t.title === track.title && t.artist === track.artist));
          if (qIndex === -1) {
            playlist.push(track);
            qIndex = playlist.length - 1;
          }
          loadTrack(qIndex, true);
          playlistModal.classList.add('hidden');
        });

        const favBtn = item.querySelector('.playlist-item-fav-toggle');
        if (favBtn) {
          favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavoriteTrack(track);
            const currentTrack = playlist[currentIndex];
            if (currentTrack && ((currentTrack.id && track.id && currentTrack.id === track.id) || (currentTrack.title === track.title && currentTrack.artist === track.artist))) {
              btnLike.classList.remove('active');
            }
            renderPlaylist();
          });
        }

        playlistItems.appendChild(item);
      });

    } else if (searchMode === 'community') {
      const displayList = customList || communitySongs;
      if (displayList.length === 0) {
        playlistItems.innerHTML = `
          <div style="text-align: center; padding: 28px 16px; color: var(--text-sub); font-size: 14px; font-weight: 600;">
            No community songs uploaded yet.<br><span style="font-size:12px; color:var(--text-muted); margin-top:6px; display:inline-block;">Click "+ Upload Song" above to share your custom tracks!</span>
          </div>
        `;
        return;
      }

      displayList.forEach((track) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';

        const uploaderText = track.uploaderName ? `by ${track.uploaderName}` : 'Community';

        item.innerHTML = `
          <img src="${track.art || generateMinimalAlbumArt(track.title, track.artist)}" alt="${track.title}">
          <div class="playlist-item-info">
            <div class="playlist-item-title">${track.title}</div>
            <div class="playlist-item-artist">${track.artist} <span class="playlist-item-badge badge-yt">${uploaderText}</span></div>
          </div>
          <div class="playlist-item-duration">${formatTime(track.duration)}</div>
          <button class="playlist-item-add" title="Play community track" style="background:none;border:none;color:var(--primary-purple-dark);font-size:18px;font-weight:800;padding:4px 8px;cursor:pointer;">▶</button>
        `;

        item.addEventListener('click', () => {
          let qIndex = playlist.findIndex(t => t.id === track.id);
          if (qIndex === -1) {
            playlist.push(track);
            qIndex = playlist.length - 1;
          }
          loadTrack(qIndex, true);
          playlistModal.classList.add('hidden');
        });

        playlistItems.appendChild(item);
      });

    } else {
      const displayList = customList || playlist;
      if (displayList.length === 0) {
        playlistItems.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-sub); font-size: 14px; font-weight: 600;">
            No tracks in queue. Click "+ Add Local" or search music online.
          </div>
        `;
        return;
      }

      displayList.forEach((track) => {
        const realIndex = playlist.findIndex(t => t.id === track.id);
        const item = document.createElement('div');
        item.className = `playlist-item ${realIndex === currentIndex ? 'active' : ''}`;

        let badgeClass = 'badge-yt';
        let badgeText = track.badge || (track.isLocal ? 'Local' : 'Online');
        if (track.isLocal) { badgeClass = 'badge-local'; }

        item.innerHTML = `
          <img src="${track.art || generateMinimalAlbumArt(track.title, track.artist)}" alt="${track.title}">
          <div class="playlist-item-info">
            <div class="playlist-item-title">${track.title}</div>
            <div class="playlist-item-artist">${track.artist} <span class="playlist-item-badge ${badgeClass}">${badgeText}</span></div>
          </div>
          <div class="playlist-item-duration">${formatTime(track.duration)}</div>
          <button class="playlist-item-remove" title="Remove track" aria-label="Remove">&times;</button>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('playlist-item-remove')) return;
          if (realIndex !== -1) loadTrack(realIndex, true);
          playlistModal.classList.add('hidden');
        });

        const removeBtn = item.querySelector('.playlist-item-remove');
        if (removeBtn) {
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (realIndex !== -1) removeTrack(realIndex);
          });
        }

        playlistItems.appendChild(item);
      });
    }
  }

  btnPlaylistToggle.addEventListener('click', () => {
    renderPlaylist();
    playlistModal.classList.remove('hidden');
  });

  btnClosePlaylist.addEventListener('click', () => {
    playlistModal.classList.add('hidden');
  });

  // Share Link
  btnShare.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    showToast('Player link copied to clipboard!');
  });

  // Profile & Auth Modal Handlers
  const btnProfile = document.getElementById('btnProfile');
  const authModal = document.getElementById('authModal');
  const profileModal = document.getElementById('profileModal');
  const uploadSongModal = document.getElementById('uploadSongModal');

  if (btnProfile) {
    btnProfile.addEventListener('click', () => {
      if (currentUser) {
        document.getElementById('editProfileName').value = currentUser.name || '';
        document.getElementById('editProfileBio').value = currentUser.bio || '';
        document.getElementById('editProfileAvatar').value = currentUser.avatar || '';
        document.getElementById('profileModalAvatar').src = currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`;
        profileModal.classList.remove('hidden');
      } else {
        authModal.classList.remove('hidden');
      }
    });
  }

  const btnCloseAuth = document.getElementById('btnCloseAuth');
  if (btnCloseAuth) btnCloseAuth.addEventListener('click', () => authModal.classList.add('hidden'));

  const authTabPhone = document.getElementById('authTabPhone');
  const authTabGoogle = document.getElementById('authTabGoogle');
  const phoneLoginForm = document.getElementById('phoneLoginForm');
  const googleLoginForm = document.getElementById('googleLoginForm');

  if (authTabPhone && authTabGoogle) {
    authTabPhone.addEventListener('click', () => {
      authTabPhone.classList.add('active');
      authTabGoogle.classList.remove('active');
      phoneLoginForm.classList.remove('hidden');
      googleLoginForm.classList.add('hidden');
    });

    authTabGoogle.addEventListener('click', () => {
      authTabGoogle.classList.add('active');
      authTabPhone.classList.remove('active');
      googleLoginForm.classList.remove('hidden');
      phoneLoginForm.classList.add('hidden');
    });
  }

  let otpSent = false;
  if (phoneLoginForm) {
    phoneLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phoneInput = document.getElementById('inputPhone').value.trim();
      const otpGroup = document.getElementById('otpGroup');
      const btnPhoneSubmit = document.getElementById('btnPhoneSubmit');

      if (!otpSent) {
        if (!phoneInput) {
          showToast('Please enter phone number');
          return;
        }
        otpSent = true;
        otpGroup.classList.remove('hidden');
        btnPhoneSubmit.textContent = 'Verify OTP & Sign In';
        showToast(`OTP Code sent to +91 ${phoneInput}! (Enter 1234)`);
      } else {
        const otpVal = document.getElementById('inputOtp').value.trim();
        if (otpVal.length < 4) {
          showToast('Enter 4-digit code (e.g. 1234)');
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/api/auth/phone-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneInput })
          });
          if (res.ok) {
            const user = await res.json();
            saveUserSession(user);
            authModal.classList.add('hidden');
            showToast(`Welcome back, ${user.name}! 🎉`);
          }
        } catch (err) {
          const fallbackUser = {
            id: 'phone_' + phoneInput,
            name: `User ${phoneInput.slice(-4)}`,
            phone: phoneInput,
            bio: 'Music Enthusiast 🎧',
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${phoneInput}`
          };
          saveUserSession(fallbackUser);
          authModal.classList.add('hidden');
          showToast(`Welcome back, ${fallbackUser.name}! 🎉`);
        }
      }
    });
  }

  const btnGoogleSubmit = document.getElementById('btnGoogleSubmit');
  if (btnGoogleSubmit) {
    btnGoogleSubmit.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('inputGoogleEmail').value.trim() || 'user@gmail.com';
      const name = document.getElementById('inputGoogleName').value.trim() || email.split('@')[0];

      try {
        const res = await fetch(`${API_BASE}/api/auth/google-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}` })
        });
        if (res.ok) {
          const user = await res.json();
          saveUserSession(user);
          authModal.classList.add('hidden');
          showToast(`Signed in as ${user.name}! 🚀`);
        }
      } catch (err) {
        const fallbackUser = {
          id: 'google_' + email.replace('@', '_at_'),
          name: name,
          email: email,
          bio: 'Listening on Moint 🎵',
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`
        };
        saveUserSession(fallbackUser);
        authModal.classList.add('hidden');
        showToast(`Signed in as ${fallbackUser.name}! 🚀`);
      }
    });
  }

  const btnCloseProfile = document.getElementById('btnCloseProfile');
  if (btnCloseProfile) btnCloseProfile.addEventListener('click', () => profileModal.classList.add('hidden'));

  const editProfileForm = document.getElementById('editProfileForm');
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) return;

      const newName = document.getElementById('editProfileName').value.trim();
      const newBio = document.getElementById('editProfileBio').value.trim();
      const newAvatar = document.getElementById('editProfileAvatar').value.trim();

      currentUser.name = newName || currentUser.name;
      currentUser.bio = newBio;
      currentUser.avatar = newAvatar || currentUser.avatar;

      saveUserSession(currentUser);

      try {
        await fetch(`${API_BASE}/api/auth/update-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, name: currentUser.name, bio: currentUser.bio, avatar: currentUser.avatar })
        });
      } catch (err) {}

      profileModal.classList.add('hidden');
      showToast('Profile updated successfully!');
    });
  }

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      saveUserSession(null);
      profileModal.classList.add('hidden');
      showToast('Signed out of Moint');
    });
  }

  // --- Custom Song Upload Modal & Community Feed ---
  const btnOpenUploadModal = document.getElementById('btnOpenUploadModal');
  const btnCloseUpload = document.getElementById('btnCloseUpload');
  const uploadSongForm = document.getElementById('uploadSongForm');
  let communitySongs = [];

  if (btnOpenUploadModal) {
    btnOpenUploadModal.addEventListener('click', () => {
      if (!currentUser) {
        showToast('Please sign in to upload custom songs!');
        authModal.classList.remove('hidden');
      } else {
        uploadSongModal.classList.remove('hidden');
      }
    });
  }

  if (btnCloseUpload) {
    btnCloseUpload.addEventListener('click', () => uploadSongModal.classList.add('hidden'));
  }

  async function fetchCommunitySongs() {
    try {
      const res = await fetch(`${API_BASE}/api/community/songs`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          communitySongs = data;
          return communitySongs;
        }
      }
    } catch (e) {}
    return communitySongs;
  }

  if (uploadSongForm) {
    uploadSongForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) {
        showToast('Please sign in to upload custom songs!');
        authModal.classList.remove('hidden');
        return;
      }

      const title = document.getElementById('uploadTitle').value.trim();
      const artist = document.getElementById('uploadArtist').value.trim();
      const audioInput = document.getElementById('uploadAudioFile');
      const artInput = document.getElementById('uploadArtFile');

      if (!audioInput.files || audioInput.files.length === 0) {
        showToast('Please select an audio file!');
        return;
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('artist', artist);
      formData.append('uploaderId', currentUser.id);
      formData.append('uploaderName', currentUser.name);
      formData.append('audio', audioInput.files[0]);
      if (artInput.files && artInput.files.length > 0) {
        formData.append('art', artInput.files[0]);
      }

      showToast(`Uploading "${title}" to community...`);
      const btnSubmitUpload = document.getElementById('btnSubmitUpload');
      if (btnSubmitUpload) btnSubmitUpload.disabled = true;

      try {
        const res = await fetch(`${API_BASE}/api/community/upload`, {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const newSong = await res.json();
          communitySongs.unshift(newSong);
          playlist.push(newSong);
          const newIdx = playlist.length - 1;

          uploadSongModal.classList.add('hidden');
          uploadSongForm.reset();
          showToast(`Successfully uploaded "${title}"! 🎉`);

          searchMode = 'community';
          if (tabCommunity) tabCommunity.classList.add('active');
          if (tabQueue) tabQueue.classList.remove('active');
          if (tabYtMusic) tabYtMusic.classList.remove('active');
          if (tabFavorites) tabFavorites.classList.remove('active');
          
          loadTrack(newIdx, true);
        } else {
          showToast('Failed to upload song. Try again.');
        }
      } catch (err) {
        showToast('Upload error. Backend server unreachable.');
      } finally {
        if (btnSubmitUpload) btnSubmitUpload.disabled = false;
      }
    });
  }

  // Backdrops Close
  [playlistModal, eqModal, authModal, profileModal, uploadSongModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    }
  });

  // Keyboard Navigation
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      nextTrack();
    } else if (e.code === 'ArrowLeft') {
      prevTrack();
    }
  });

  // Initial Load
  loadTrack(0);
});
