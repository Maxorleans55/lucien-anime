const API = "https://api.tenrai.org/v1";

const OFFICIAL_SOURCE_LINKS = {
  museAsia: {
    channel: "https://www.youtube.com/@MuseAsia",
    videos: "https://www.youtube.com/@MuseAsia/videos",
    playlists: "https://www.youtube.com/@MuseAsia/playlists"
  },
  aniOneAsia: {
    channel: "https://www.youtube.com/@AniOneAsia",
    videos: "https://www.youtube.com/@AniOneAsia/videos",
    playlists: "https://www.youtube.com/@AniOneAsia/playlists"
  }
};

const OFFICIAL_EPISODE_VIDEOS = {};

let animeList = [];
let watchlist = [];

try {
  watchlist = JSON.parse(localStorage.getItem("lucienWatchlist") || "[]");
  if (!Array.isArray(watchlist)) watchlist = [];
  if (watchlist.length && typeof watchlist[0] === "number") {
    watchlist = [];
    localStorage.setItem("lucienWatchlist", "[]");
  }
} catch {
  watchlist = [];
}

const animeGrid = document.getElementById("animeGrid");
const watchlistGrid = document.getElementById("watchlistGrid");
const searchInput = document.getElementById("searchInput");
const genreFilter = document.getElementById("genreFilter");
const emptyWatchlist = document.getElementById("emptyWatchlist");

const modal = document.getElementById("playerModal");
const modalTitle = document.getElementById("modalTitle");
const closeModal = document.getElementById("closeModal");

const videoStatus = document.getElementById("videoStatus");
const episodeFrame = document.getElementById("episodeFrame");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");

const trailerSection = document.getElementById("trailerSection");
const detailPanel = document.getElementById("animeDetailPanel");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function normalizeAnime(item) {
  return {
    id: item.mal_id,
    title: item.title_english || item.title || "Unknown Anime",
    image: item.images?.webp?.large_image_url ||
      item.images?.jpg?.large_image_url || "",
    genres: (item.genres || []).map(g => g.name),
    episodes: item.episodes ?? "Unknown",
    score: item.score ?? "Not rated",
    synopsis: item.synopsis || "No description available."
  };
}

async function loadAnime(url = `${API}/anime`) {
  animeGrid.innerHTML = "<p>Loading anime...</p>";

  try {
    const result = await getJSON(url);

    if (!Array.isArray(result.data)) {
      throw new Error("Unexpected anime response.");
    }

    animeList = result.data
      .filter(item => item.mal_id)
      .map(normalizeAnime);

    renderAnime();
  } catch (error) {
    console.error("Anime loading error:", error);
    animeGrid.innerHTML =
      "<p>Unable to load anime. Please try again.</p>";
  }
}

function createAnimeCard(anime) {
  const saved = watchlist.some(item => item.id === anime.id);

  return `
    <article class="anime-card">
      <div class="poster">
        ${anime.image
          ? `<img src="${escapeHTML(anime.image)}"
              alt="${escapeHTML(anime.title)}" loading="lazy">`
          : ""}
        <h3>${escapeHTML(anime.title)}</h3>
      </div>

      <div class="card-info">
        <strong>${escapeHTML(anime.title)}</strong>

        <p>
          ${escapeHTML(anime.genres[0] || "Anime")}
          · ${anime.episodes} episodes · ⭐ ${anime.score}
        </p>

        <div class="card-actions">
          <button class="watch-button" data-watch="${anime.id}">
            VIEW DETAILS
          </button>

          <button class="save-button ${saved ? "is-saved" : ""}" data-save="${anime.id}">
            ${saved ? "SAVED ✓" : "+ WATCHLIST"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderAnime() {
  const selectedGenre = genreFilter.value;

  const filteredAnime = animeList.filter(anime =>
    selectedGenre === "All" ||
    anime.genres.includes(selectedGenre)
  );

  animeGrid.innerHTML = filteredAnime.length
    ? filteredAnime.map(createAnimeCard).join("")
    : "<p>No anime found.</p>";

  renderWatchlist();
}

function renderWatchlist() {
  watchlistGrid.innerHTML = watchlist.length
    ? watchlist.map(createAnimeCard).join("")
    : "";

  emptyWatchlist.style.display =
    watchlist.length ? "none" : "block";
}

function toggleWatchlist(id) {
  const existing = watchlist.find(item => item.id === id);

  if (existing) {
    watchlist = watchlist.filter(item => item.id !== id);
  } else {
    const anime = animeList.find(item => item.id === id);
    if (anime) watchlist.push(anime);
  }

  localStorage.setItem(
    "lucienWatchlist",
    JSON.stringify(watchlist)
  );

  renderAnime();
}

function youtubeVideoId(item) {
  if (!item) return "";

  const candidates = [
    item.embed_url,
    item.url,
    item.youtube_id,
    item.videoId
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate).trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
      return value;
    }

    try {
      const url = new URL(value);

      if (
        ["www.youtube.com", "youtube.com",
         "www.youtube-nocookie.com",
         "youtube-nocookie.com"].includes(url.hostname)
      ) {
        if (url.pathname.startsWith("/embed/")) {
          const id = url.pathname.split("/")[2];
          if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
        }

        const id = url.searchParams.get("v");

        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }

      if (url.hostname === "youtu.be") {
        const id = url.pathname.slice(1).split("/")[0];

        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }
    } catch {
      // Invalid URL.
    }
  }

  return "";
}

function stopEpisodePlayback(
  message = "Choose an available episode below."
) {
  episodeFrame.src = "about:blank";
  nowPlayingTitle.textContent = "SELECT AN EPISODE";
  videoStatus.textContent = message;
}

function playOfficialEpisode(
  anime,
  episodeNumber,
  episodeTitle,
  source
) {
  const videoId = source?.videoId;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    videoStatus.textContent =
      "This episode does not have a verified official video linked yet.";
    return;
  }

  const title = `Episode ${episodeNumber}${
    episodeTitle ? ` — ${episodeTitle}` : ""
  }`;

  nowPlayingTitle.textContent = `${anime.title} — ${title}`;

  videoStatus.textContent =
    `Loading official ${source.provider} video.`;

  episodeFrame.src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;

  document.getElementById("lucienPlayerSection")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function getVideoList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  return [
    ...(Array.isArray(data.promo) ? data.promo : []),
    ...(Array.isArray(data.episodes) ? data.episodes : []),
    ...(Array.isArray(data.music_videos) ? data.music_videos : [])
  ];
}

function renderTrailers(videosData, details) {
  const videos = getVideoList(videosData);

  if (details?.trailer) {
    videos.unshift(details.trailer);
  }

  const uniqueVideos = [];
  const seen = new Set();

  videos.forEach(item => {
    const id = youtubeVideoId(item);

    if (id && !seen.has(id)) {
      seen.add(id);

      uniqueVideos.push({
        title: item.title || item.name || "Anime trailer",
        id
      });
    }
  });

  if (!uniqueVideos.length) {
    trailerSection.innerHTML = `
      <h3>TRAILERS</h3>
      <p class="modal-note">
        No embeddable trailer was found for this anime.
      </p>
    `;
    return;
  }

  trailerSection.innerHTML = `
    <h3>WATCH TRAILERS</h3>

    <div class="trailer-list">
      ${uniqueVideos.map((item, index) => `
        <button type="button"
          data-trailer-index="${index}">
          <span>${escapeHTML(item.title)}</span>
          <strong>PLAY ▶</strong>
        </button>
      `).join("")}
    </div>

    <iframe
      id="trailerFrame"
      title="Anime trailer player"
      src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(uniqueVideos[0].id)}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  `;

  const frame = document.getElementById("trailerFrame");

  trailerSection
    .querySelectorAll("[data-trailer-index]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const selected =
          uniqueVideos[Number(button.dataset.trailerIndex)];

        if (selected) {
          frame.src =
            `https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected.id)}?autoplay=1`;
        }
      });
    });
}

function renderEpisodes(episodes, anime) {
  const episodeSection =
    document.getElementById("episodeSection");

  if (!episodeSection) return;

  if (!episodes.length) {
    episodeSection.innerHTML = `
      <h3>EPISODES</h3>
      <p class="modal-note">
        Episode listings are not available for this title.
      </p>
    `;
    return;
  }

  const sourcesForAnime =
    OFFICIAL_EPISODE_VIDEOS[String(anime.id)] || {};

  episodeSection.innerHTML = `
    <h3>EPISODE GUIDE</h3>

    <div class="episode-list">
      ${episodes.map((episode, index) => {
        const number = Number(episode.mal_id) || index + 1;
        const source = sourcesForAnime[String(number)];

        const available = Boolean(
          source?.videoId &&
          /^[a-zA-Z0-9_-]{11}$/.test(source.videoId)
        );

        return `
          <button
            class="episode-item"
            type="button"
            data-episode-number="${number}"
            ${available ? "" : "disabled"}
          >
            <span>
              <strong>Episode ${number}</strong><br>
              ${escapeHTML(episode.title || "Untitled episode")}
            </span>

            <span class="episode-play-state">
              ${available ? "PLAY ▶" : "NOT LINKED"}
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;

  episodeSection
    .querySelectorAll("[data-episode-number]:not([disabled])")
    .forEach(button => {
      button.addEventListener("click", () => {
        const number = Number(button.dataset.episodeNumber);

        const episode = episodes.find((item, index) =>
          (Number(item.mal_id) || index + 1) === number
        );

        const source = sourcesForAnime[String(number)];

        playOfficialEpisode(
          anime,
          number,
          episode?.title || "",
          source
        );
      });
    });
}

function renderStreamingProviders(streamingData) {
  const streamingSection =
    document.getElementById("streamingSection");

  if (!streamingSection) return;

  const providers = Array.isArray(streamingData?.data)
    ? streamingData.data
    : [];

  const safeProviders = providers.filter(provider => {
    try {
      const url = new URL(provider.url);
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  });

  streamingSection.innerHTML = `
    <h3>OFFICIAL STREAMING OPTIONS</h3>

    ${safeProviders.length ? `
      <div class="provider-list">
        ${safeProviders.map(provider => `
          <a href="${escapeHTML(provider.url)}"
            target="_blank"
            rel="noopener noreferrer">
            ${escapeHTML(provider.name || "Streaming provider")}
            <span>OPEN ↗</span>
          </a>
        `).join("")}
      </div>
    ` : `
      <p class="modal-note">
        No streaming-provider links were returned.
      </p>
    `}
  `;
}

function renderOfficialSources() {
  const sourceSection =
    document.getElementById("officialSources");

  if (!sourceSection) return;

  sourceSection.innerHTML = `
    <h3>OFFICIAL ANIME SOURCES</h3>

    <div class="provider-list">
      <a href="${OFFICIAL_SOURCE_LINKS.museAsia.channel}"
        target="_blank" rel="noopener noreferrer">
        Muse Asia Channel <span>OPEN ↗</span>
      </a>

      <a href="${OFFICIAL_SOURCE_LINKS.museAsia.videos}"
        target="_blank" rel="noopener noreferrer">
        Muse Asia Videos <span>OPEN ↗</span>
      </a>

      <a href="${OFFICIAL_SOURCE_LINKS.museAsia.playlists}"
        target="_blank" rel="noopener noreferrer">
        Muse Asia Playlists <span>OPEN ↗</span>
      </a>

      <a href="${OFFICIAL_SOURCE_LINKS.aniOneAsia.channel}"
        target="_blank" rel="noopener noreferrer">
        Ani-One Asia Channel <span>OPEN ↗</span>
      </a>

      <a href="${OFFICIAL_SOURCE_LINKS.aniOneAsia.videos}"
        target="_blank" rel="noopener noreferrer">
        Ani-One Asia Videos <span>OPEN ↗</span>
      </a>

      <a href="${OFFICIAL_SOURCE_LINKS.aniOneAsia.playlists}"
        target="_blank" rel="noopener noreferrer">
        Ani-One Asia Playlists <span>OPEN ↗</span>
      </a>
    </div>
  `;
}

async function openAnimeDetails(id) {
  const anime = animeList.find(item => item.id === id);
  if (!anime) return;

  modalTitle.textContent = anime.title;
  modal.classList.add("show");

  detailPanel.innerHTML =
    "<p>Loading anime information...</p>";

  trailerSection.innerHTML = "";
  stopEpisodePlayback();

  const results = await Promise.allSettled([
    getJSON(`${API}/anime/${id}/full`),
    getJSON(`${API}/anime/${id}/episodes`),
    getJSON(`${API}/anime/${id}/videos`),
    getJSON(`${API}/anime/${id}/streaming`)
  ]);

  const details = results[0].status === "fulfilled"
    ? results[0].value.data
    : anime;

  const episodes = results[1].status === "fulfilled"
    ? results[1].value.data || []
    : [];

  const videosData = results[2].status === "fulfilled"
    ? results[2].value.data
    : [];

  const streamingData = results[3].status === "fulfilled"
    ? results[3].value
    : { data: [] };

  const genres = (details.genres || [])
    .map(genre => genre.name)
    .join(", ");

  detailPanel.innerHTML = `
    <div class="detail-layout">
      <img class="detail-poster"
        src="${escapeHTML(anime.image)}"
        alt="${escapeHTML(anime.title)}">

      <div class="detail-info">
        <p class="eyebrow">ANIME DETAILS</p>
        <h3>${escapeHTML(details.title_english || details.title || anime.title)}</h3>
        <p><strong>Rating:</strong> ${details.score ?? "Not rated"}</p>
        <p><strong>Episodes:</strong> ${details.episodes ?? "Unknown"}</p>
        <p><strong>Status:</strong> ${escapeHTML(details.status || "Unknown")}</p>
        <p><strong>Genres:</strong> ${escapeHTML(genres || "Not listed")}</p>
        <p class="detail-synopsis">
          ${escapeHTML(details.synopsis || anime.synopsis)}
        </p>
      </div>
    </div>

    <section id="episodeSection"></section>
    <section id="streamingSection"></section>
  `;

  renderEpisodes(episodes, anime);
  renderStreamingProviders(streamingData);
  renderTrailers(videosData, details);
}

document.addEventListener("click", event => {
  const watchButton = event.target.closest("[data-watch]");
  const saveButton = event.target.closest("[data-save]");

  if (watchButton) {
    openAnimeDetails(Number(watchButton.dataset.watch));
  }

  if (saveButton) {
    toggleWatchlist(Number(saveButton.dataset.save));
  }
});

let searchTimer;

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    const query = searchInput.value.trim();

    loadAnime(
      query
        ? `${API}/anime?q=${encodeURIComponent(query)}`
        : undefined
    );
  }, 700);
});

genreFilter.addEventListener("change", renderAnime);

function closePlayerModal() {
  modal.classList.remove("show");

  stopEpisodePlayback(
    "Choose an anime to see its episodes."
  );

  const trailerFrame =
    document.getElementById("trailerFrame");

  if (trailerFrame) {
    trailerFrame.src = "about:blank";
  }
}

closeModal.addEventListener("click", closePlayerModal);

modal.addEventListener("click", event => {
  if (event.target === modal) {
    closePlayerModal();
  }
});

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    modal.classList.contains("show")
  ) {
    closePlayerModal();
  }
});

renderOfficialSources();
loadAnime();