/**
 * ==========================================================
 * 8C UNIVERSE — SISTEM MUSIK & DAFTAR LAGU (VANILLA JS)
 * ==========================================================
 * - Halaman Terpisah (daftarlagu.html & index.html)
 * - Floating Music Player di pojok kiri bawah (#musicBox)
 * - Auto-Hide behavior (Hidden default -> Pop-up on play -> Auto-hide 7s -> Reset on interaction)
 * - HTML5 Audio API murni
 * - Path resolver: new URL(path, document.baseURI).href
 * - Auto-Next & Auto-Looping
 * - Fallback cover & Error handling
 */

(function () {
  "use strict";

  // DATA PLAYLIST LOKAL (Relative path terisolasi aman)
  const songs = [
    {
      id: 1,
      title: "Confidence Anthem",
      artist: "8C-SADOEL",
      album: "Universe Vol. 1",
      src: "music/song-1.mp3",
      cover: "covers/song-1.jpg"
    },
    {
      id: 2,
      title: "Midnight Study",
      artist: "Confidence Beats",
      album: "Lo-Fi 8C",
      src: "music/song-2.mp3",
      cover: "covers/song-2.jpg"
    },
    {
      id: 3,
      title: "Semangat Pagi 8C",
      artist: "Class of 8C",
      album: "Semangat Belajar",
      src: "music/song-3.mp3",
      cover: "covers/song-3.jpg"
    }
  ];

  // Fallback SVG Cover Cyber Placeholder (Data URI)
  const FALLBACK_COVER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
    '<defs>' +
    '<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#0a0e2e"/>' +
    '<stop offset="100%" stop-color="#040310"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="120" height="120" rx="18" fill="url(#bg)"/>' +
    '<circle cx="60" cy="60" r="38" fill="none" stroke="#7c5cff" stroke-width="2.5" stroke-dasharray="4 3"/>' +
    '<circle cx="60" cy="60" r="14" fill="#141840" stroke="#38e0d8" stroke-width="2"/>' +
    '<path d="M57 52 L68 60 L57 68 Z" fill="#38e0d8"/>' +
    '</svg>'
  );

  // Relative Path Resolver Aman menggunakan document.baseURI dan window.location.origin
  function getSafeUrl(relativePath) {
    if (!relativePath) return "";
    if (relativePath.startsWith("data:") || relativePath.startsWith("blob:") || relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
      return relativePath;
    }
    try {
      const clean = relativePath.replace(/\\/g, "/");
      const normalized = clean.startsWith("/") ? clean : "/" + clean;
      const origin = window.location.origin;
      if (origin && origin !== "null" && !origin.startsWith("file:")) {
        return origin + normalized;
      }
      const base = document.baseURI || window.location.href;
      return new URL(normalized, base).href;
    } catch (e) {
      return relativePath.replace(/\\/g, "/");
    }
  }

  // Format Waktu ke mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  // Modul Pemutar Musik
  const MusicPlayer = {
    songs: songs,
    currentIndex: 0,
    isPlaying: false,
    audio: null,
    elements: {},
    autoHideTimer: null,
    errorTimeout: null,
    AUTO_HIDE_DELAY: 7000, // 7 detik (dalam rentang 5-10 detik)

    init: function () {
      this.cacheDom();
      if (!this.elements.audio || !this.elements.box) return;

      this.audio = this.elements.audio;
      this.audio.volume = 0.85;

      this.bindAudioEvents();
      this.bindControlEvents();
      this.bindAutoHideEvents();

      // Render grid jika sedang di halaman daftarlagu.html
      if (this.elements.songsGrid) {
        this.renderSongsGrid(this.songs);
        this.bindSearchFilter();
      }

      // Load data lagu pertama (Default State: player tersembunyi)
      this.loadSong(0, false);
      this.hidePlayer();
    },

    cacheDom: function () {
      this.elements = {
        wrap: document.getElementById("musicFloatingWrap"),
        box: document.getElementById("musicBox"),
        pillToggle: document.getElementById("musicPillToggle"),
        audio: document.getElementById("mbAudio"),
        cover: document.getElementById("mbCover"),
        title: document.getElementById("mbTitle"),
        artist: document.getElementById("mbArtist"),
        status: document.getElementById("mbStatus"),
        playBtn: document.getElementById("mbPlayBtn"),
        closeBtn: document.getElementById("mbCloseBtn"),
        iconPlay: document.getElementById("mbIconPlay"),
        iconPause: document.getElementById("mbIconPause"),
        prevBtn: document.getElementById("mbPrevBtn"),
        nextBtn: document.getElementById("mbNextBtn"),
        barWrap: document.getElementById("mbBarWrap"),
        barFill: document.getElementById("mbBarFill"),
        timeDisplay: document.getElementById("mbTimeDisplay"),
        volSlider: document.getElementById("mbVolSlider"),
        searchInput: document.getElementById("songSearchInput"),
        songsGrid: document.getElementById("songsGridContainer")
      };
    },

    // 1. BEHAVIOR: SHOW & AUTO-HIDE
    showPlayer: function () {
      if (this.elements.wrap) {
        this.elements.wrap.classList.add("show-player");
      }
      if (this.elements.pillToggle) {
        this.elements.pillToggle.classList.add("hidden");
      }
      this.resetAutoHideTimer();
    },

    hidePlayer: function () {
      if (this.elements.wrap) {
        this.elements.wrap.classList.remove("show-player");
      }
      if (this.elements.pillToggle) {
        this.elements.pillToggle.classList.remove("hidden");
      }
      if (this.autoHideTimer) {
        clearTimeout(this.autoHideTimer);
        this.autoHideTimer = null;
      }
    },

    resetAutoHideTimer: function () {
      if (this.autoHideTimer) {
        clearTimeout(this.autoHideTimer);
        this.autoHideTimer = null;
      }

      const self = this;
      this.autoHideTimer = setTimeout(function () {
        self.hidePlayer();
      }, this.AUTO_HIDE_DELAY);
    },

    bindAutoHideEvents: function () {
      const self = this;

      // Klik pill kecil untuk memunculkan player kembali kapan saja
      if (this.elements.pillToggle) {
        this.elements.pillToggle.addEventListener("click", function () {
          self.showPlayer();
        });
      }

      // Jika mouse hover ke player, hentikan sementara timer auto-hide
      if (this.elements.box) {
        this.elements.box.addEventListener("mouseenter", function () {
          if (self.autoHideTimer) {
            clearTimeout(self.autoHideTimer);
            self.autoHideTimer = null;
          }
        });

        // Saat kursor meninggalkan player, lanjutkan timer auto-hide
        this.elements.box.addEventListener("mouseleave", function () {
          self.resetAutoHideTimer();
        });

        // Setiap interaksi sentuhan atau klik di player mereset timer
        this.elements.box.addEventListener("touchstart", function () {
          self.resetAutoHideTimer();
        }, { passive: true });
      }
    },

    // 2. AUDIO PLAYBACK LOGIC
    loadSong: function (index, shouldPlay) {
      if (index < 0 || index >= this.songs.length) index = 0;
      this.currentIndex = index;
      const song = this.songs[index];

      // Update Info Player
      if (this.elements.title) {
        this.elements.title.textContent = song.title;
        this.elements.title.title = song.title;
      }
      if (this.elements.artist) {
        this.elements.artist.textContent = song.artist + (song.album ? " • " + song.album : "");
      }
      if (this.elements.status) {
        this.elements.status.textContent = "Track " + (index + 1) + " / " + this.songs.length;
        this.elements.status.classList.remove("error");
      }
      if (this.elements.cover) {
        this.elements.cover.src = getSafeUrl(song.cover);
        this.elements.cover.onerror = function () {
          this.src = FALLBACK_COVER;
        };
      }

      // Reset progress bar
      if (this.elements.barFill) this.elements.barFill.style.width = "0%";
      if (this.elements.timeDisplay) this.elements.timeDisplay.textContent = "0:00 / 0:00";

      // Set audio source
      this.audio.src = getSafeUrl(song.src);
      this.audio.load();

      this.updateActiveCardState();

      if (shouldPlay) {
        this.play();
      } else {
        this.setPlayingUi(false);
      }
    },

    play: function () {
      const self = this;
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }

      // Saat Play, player WAJIB MUNCUL (Pop-up/Slide-in) & menyalakan auto-hide timer 5-10 detik
      this.showPlayer();

      const promise = this.audio.play();
      if (promise !== undefined) {
        promise
          .then(function () {
            self.setPlayingUi(true);
          })
          .catch(function (error) {
            console.warn("Autoplay browser diblokir atau butuh interaksi pengguna:", error);
            self.setPlayingUi(false);
            if (self.elements.status) {
              self.elements.status.textContent = "Klik Play untuk mulai memutar";
            }
          });
      }
    },

    pause: function () {
      this.audio.pause();
      this.setPlayingUi(false);
      this.resetAutoHideTimer();
    },

    togglePlay: function () {
      if (this.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    },

    next: function () {
      // Auto-Looping: kembali ke lagu pertama index 0 setelah lagu terakhir
      const nextIdx = (this.currentIndex + 1) % this.songs.length;
      this.loadSong(nextIdx, true);
    },

    prev: function () {
      const prevIdx = (this.currentIndex - 1 + this.songs.length) % this.songs.length;
      this.loadSong(prevIdx, true);
    },

    setPlayingUi: function (playing) {
      this.isPlaying = playing;
      if (this.elements.box) {
        this.elements.box.classList.toggle("is-playing", playing);
      }
      if (this.elements.iconPlay && this.elements.iconPause) {
        this.elements.iconPlay.style.display = playing ? "none" : "block";
        this.elements.iconPause.style.display = playing ? "block" : "none";
      }
      this.updateActiveCardState();
    },

    bindAudioEvents: function () {
      const self = this;

      // Update Seeker Progress Bar & Time
      this.audio.addEventListener("timeupdate", function () {
        const cur = self.audio.currentTime || 0;
        const dur = self.audio.duration || 0;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;

        if (self.elements.barFill) {
          self.elements.barFill.style.width = pct + "%";
        }
        if (self.elements.timeDisplay) {
          self.elements.timeDisplay.textContent = formatTime(cur) + " / " + formatTime(dur);
        }
      });

      this.audio.addEventListener("loadedmetadata", function () {
        if (self.elements.timeDisplay) {
          self.elements.timeDisplay.textContent = "0:00 / " + formatTime(self.audio.duration);
        }
      });

      // Auto-Next & Auto-Looping saat lagu selesai
      this.audio.addEventListener("ended", function () {
        self.next();
      });

      // Error handling audio: Tampilkan status graceful dan skip ke lagu berikutnya
      this.audio.addEventListener("error", function () {
        self.setPlayingUi(false);
        if (self.elements.status) {
          self.elements.status.textContent = "Gagal memuat audio, beralih...";
          self.elements.status.classList.add("error");
        }
        self.showPlayer();
        self.errorTimeout = setTimeout(function () {
          self.next();
        }, 2000);
      });
    },

    bindControlEvents: function () {
      const self = this;

      if (this.elements.playBtn) {
        this.elements.playBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          self.togglePlay();
          self.resetAutoHideTimer();
        });
      }

      if (this.elements.closeBtn) {
        this.elements.closeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          self.hidePlayer();
        });
      }

      if (this.elements.prevBtn) {
        this.elements.prevBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          self.prev();
          self.resetAutoHideTimer();
        });
      }

      if (this.elements.nextBtn) {
        this.elements.nextBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          self.next();
          self.resetAutoHideTimer();
        });
      }

      // Seeker Bar Scrubbing / Click
      if (this.elements.barWrap) {
        this.elements.barWrap.addEventListener("click", function (e) {
          const rect = self.elements.barWrap.getBoundingClientRect();
          const clickPos = (e.clientX - rect.left) / rect.width;
          if (self.audio.duration) {
            self.audio.currentTime = clickPos * self.audio.duration;
          }
          self.resetAutoHideTimer();
        });
      }

      // Volume Slider
      if (this.elements.volSlider) {
        this.elements.volSlider.addEventListener("input", function (e) {
          const vol = parseFloat(e.target.value);
          self.audio.volume = Math.max(0, Math.min(1, vol));
          self.resetAutoHideTimer();
        });
      }
    },

    // 3. DAFTAR LAGU GRID & REALTIME SEARCH (KHUSUS daftarlagu.html)
    renderSongsGrid: function (list) {
      const container = this.elements.songsGrid;
      if (!container) return;

      container.innerHTML = "";

      if (!list || list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "song-empty-msg";
        empty.textContent = "Tidak ada lagu yang cocok dengan pencarian.";
        container.appendChild(empty);
        return;
      }

      const self = this;
      list.forEach(function (song) {
        const originalIndex = self.songs.findIndex(function (s) {
          return s.id === song.id;
        });

        const card = document.createElement("div");
        const isActive = originalIndex === self.currentIndex;
        card.className = "song-card" + (isActive ? " is-active" : "");
        card.setAttribute("data-song-idx", String(originalIndex));

        const coverSrc = getSafeUrl(song.cover);

        card.innerHTML =
          '<div class="song-card-cover-wrap">' +
          '<img class="song-card-cover" src="' + coverSrc + '" alt="' + song.title + '" onerror="this.src=\'' + FALLBACK_COVER + '\'"/>' +
          '</div>' +
          '<div class="song-card-meta">' +
          '<div class="song-card-title">' + song.title + '</div>' +
          '<div class="song-card-artist">' + song.artist + '</div>' +
          '<div class="song-card-album">' + (song.album || "Single") + '</div>' +
          '</div>' +
          '<button class="song-card-btn" aria-label="Putar ' + song.title + '">' +
          '<svg viewBox="0 0 24 24">' +
          (isActive && self.isPlaying
            ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
            : '<path d="M8 5v14l11-7z"/>') +
          '</svg>' +
          '</button>';

        // Klik kartu lagu untuk memutar
        card.addEventListener("click", function () {
          if (self.currentIndex === originalIndex) {
            self.togglePlay();
          } else {
            self.loadSong(originalIndex, true);
          }
          self.showPlayer();
        });

        container.appendChild(card);
      });
    },

    updateActiveCardState: function () {
      const cards = document.querySelectorAll(".song-card");
      const self = this;
      cards.forEach(function (c) {
        const idx = parseInt(c.getAttribute("data-song-idx"), 10);
        const isActive = idx === self.currentIndex;
        c.classList.toggle("is-active", isActive);

        const svg = c.querySelector(".song-card-btn svg");
        if (svg) {
          if (isActive && self.isPlaying) {
            svg.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
          } else {
            svg.innerHTML = '<path d="M8 5v14l11-7z"/>';
          }
        }
      });
    },

    bindSearchFilter: function () {
      const self = this;
      if (!this.elements.searchInput) return;

      this.elements.searchInput.addEventListener("input", function (e) {
        const query = (e.target.value || "").trim().toLowerCase();
        if (!query) {
          self.renderSongsGrid(self.songs);
          return;
        }

        const filtered = self.songs.filter(function (s) {
          return (
            (s.title && s.title.toLowerCase().includes(query)) ||
            (s.artist && s.artist.toLowerCase().includes(query)) ||
            (s.album && s.album.toLowerCase().includes(query))
          );
        });

        self.renderSongsGrid(filtered);
      });
    }
  };

  // Expose ke global namespace
  window.MusicPlayer = MusicPlayer;

  // Inisialisasi otomatis setelah DOM selesai (kompatibel dengan ES module & static script)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      MusicPlayer.init();
    });
  } else {
    MusicPlayer.init();
  }
})();
