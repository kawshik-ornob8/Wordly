(async () => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  async function loadWords() {
    const response = await fetch("words.json");
    if (!response.ok) throw new Error(`Unable to load words.json (${response.status})`);

    const payload = await response.json();
    if (!Array.isArray(payload.words)) throw new Error("words.json has an invalid format");

    return payload.words.map(([word, part, definition, example]) => ({
      word,
      part,
      definition,
      example,
      pronunciation: "",
      synonyms: []
    }));
  }

  let words;
  try {
    words = await loadWords();
  } catch (error) {
    console.error(error);
    $(".current-word").textContent = "Words unavailable";
    $(".pronunciation").textContent = "Please refresh the page.";
    $(".tap-hint").hidden = true;
    $(".result-count").textContent = "Unable to load the word library";
    return;
  }

  const saved = new Set(JSON.parse(localStorage.getItem("wordly-saved") || "[]"));
  const learned = new Set(JSON.parse(localStorage.getItem("wordly-learned") || "[]"));
  let deck = [...words];
  let currentIndex = Math.max(0, Math.min(Number(localStorage.getItem("wordly-index")) || 0, words.length - 1));
  let activePart = "all";
  let savedOnly = false;
  let visibleCount = 9;
  let touchStartX = 0;
  let toastTimer;

  const flashCard = $(".flash-card");
  const answer = $(".card-answer");
  const searchInput = $(".search-box input");
  const grid = $(".word-grid");

  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);

  function persist() {
    localStorage.setItem("wordly-saved", JSON.stringify([...saved]));
    localStorage.setItem("wordly-learned", JSON.stringify([...learned]));
    localStorage.setItem("wordly-index", String(currentIndex));
  }

  function showToast(message) {
    const toast = $(".toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function speak(word, button) {
    if (!("speechSynthesis" in window)) {
      showToast("Audio pronunciation is not supported in this browser.");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    button?.classList.add("speaking");
    utterance.onend = utterance.onerror = () => button?.classList.remove("speaking");
    speechSynthesis.speak(utterance);
  }

  function updateStats() {
    $$(".word-count").forEach(el => { el.textContent = words.length.toLocaleString(); });
    $(".learned-count").textContent = learned.size.toLocaleString();
    $(".saved-count").textContent = saved.size.toLocaleString();

    const today = new Date().toISOString().slice(0, 10);
    const lastVisit = localStorage.getItem("wordly-visit");
    if (lastVisit !== today) localStorage.setItem("wordly-visit", today);
  }

  function renderDeck(animate = false) {
    if (!deck.length) return;
    if (currentIndex >= deck.length) currentIndex = 0;
    const item = deck[currentIndex];
    const apply = () => {
      $(".card-number").textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${String(deck.length).padStart(2, "0")}`;
      $(".card-progress span").style.width = `${((currentIndex + 1) / deck.length) * 100}%`;
      $(".part-badge").textContent = item.part;
      $(".current-word").textContent = item.word;
      $(".pronunciation").textContent = item.pronunciation;
      $(".definition").textContent = item.definition;
      $(".example").textContent = item.example ? `“${item.example}”` : "No example is available for this entry.";
      $(".synonyms").innerHTML = item.synonyms.map(value => `<span>${escapeHTML(value)}</span>`).join("");
      $(".save-word").classList.toggle("active", saved.has(item.word));
      $(".save-word").setAttribute("aria-label", saved.has(item.word) ? "Remove this saved word" : "Save this word");
      flashCard.classList.remove("revealed", "card-out");
      answer.hidden = true;
      $(".reveal-button").childNodes[0].nodeValue = "Reveal answer ";
      persist();
    };
    if (animate) {
      flashCard.classList.add("card-out");
      setTimeout(apply, 130);
    } else apply();
  }

  function reveal(force) {
    const shouldReveal = typeof force === "boolean" ? force : answer.hidden;
    answer.hidden = !shouldReveal;
    flashCard.classList.toggle("revealed", shouldReveal);
    $(".reveal-button").childNodes[0].nodeValue = shouldReveal ? "Hide answer " : "Reveal answer ";
  }

  function move(direction) {
    if (!deck.length) return;
    currentIndex = (currentIndex + direction + deck.length) % deck.length;
    renderDeck(true);
  }

  function toggleSave(word) {
    if (saved.has(word)) {
      saved.delete(word);
      showToast(`Removed “${word}” from saved words`);
    } else {
      saved.add(word);
      showToast(`Saved “${word}” for later`);
    }
    persist();
    updateStats();
    renderGrid();
    if (deck[currentIndex]?.word === word) $(".save-word").classList.toggle("active", saved.has(word));
  }

  function filteredWords() {
    const query = searchInput.value.trim().toLowerCase();
    const sort = $(".sort-select").value;
    let result = words.filter(item => {
      const partMatches = activePart === "all" || item.part === activePart;
      const savedMatches = !savedOnly || saved.has(item.word);
      const queryMatches = !query || [item.word, item.definition, item.example, item.part, ...item.synonyms]
        .some(value => value.toLowerCase().includes(query));
      return partMatches && savedMatches && queryMatches;
    });
    if (sort === "za") result.sort((a, b) => b.word.localeCompare(a.word));
    else if (sort === "saved") result.sort((a, b) => Number(saved.has(b.word)) - Number(saved.has(a.word)) || a.word.localeCompare(b.word));
    else result.sort((a, b) => a.word.localeCompare(b.word));
    return result;
  }

  function cardTemplate(item) {
    const isSaved = saved.has(item.word);
    return `
      <article class="word-card" data-word="${escapeHTML(item.word)}">
        <div class="word-card-top">
          <span class="mini-part">${escapeHTML(item.part)}</span>
          <div class="word-card-actions">
            <button class="grid-speak" type="button" aria-label="Play pronunciation for ${escapeHTML(item.word)}">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Zm4.5 4a4.5 4.5 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12"/></svg>
            </button>
            <button class="grid-save${isSaved ? " active" : ""}" type="button" aria-label="${isSaved ? "Remove" : "Save"} ${escapeHTML(item.word)}">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.7 5.47 6.04.88-4.37 4.25 1.03 6.01L12 16.77 6.6 19.61l1.03-6.01-4.37-4.25 6.04-.88L12 3Z"/></svg>
            </button>
          </div>
        </div>
        <h3>${escapeHTML(item.word)}</h3>
        <p class="grid-definition">${escapeHTML(item.definition)}</p>
        <p class="grid-example">${item.example ? `“${escapeHTML(item.example)}”` : "No example is available for this entry."}</p>
      </article>`;
  }

  function renderGrid() {
    const result = filteredWords();
    const visible = result.slice(0, visibleCount);
    grid.innerHTML = visible.map(cardTemplate).join("");
    $(".result-count").textContent = `Showing ${Math.min(visible.length, result.length)} of ${result.length} words`;
    $(".load-more").hidden = result.length <= visibleCount;
    $(".empty-state").hidden = result.length !== 0;
    grid.hidden = result.length === 0;
  }

  function clearFilters() {
    activePart = "all";
    savedOnly = false;
    visibleCount = 9;
    searchInput.value = "";
    $(".sort-select").value = "az";
    $$(".filter-chip").forEach(chip => chip.classList.toggle("active", chip.dataset.part === "all"));
    renderGrid();
  }

  $(".deck-prev").addEventListener("click", () => move(-1));
  $(".deck-next").addEventListener("click", () => move(1));
  $(".review-button").addEventListener("click", () => move(1));
  $(".reveal-button").addEventListener("click", () => reveal());
  flashCard.addEventListener("click", event => {
    if (!event.target.closest("button")) reveal();
  });
  flashCard.addEventListener("touchstart", event => { touchStartX = event.changedTouches[0].screenX; }, { passive: true });
  flashCard.addEventListener("touchend", event => {
    const distance = event.changedTouches[0].screenX - touchStartX;
    if (Math.abs(distance) > 60) move(distance > 0 ? -1 : 1);
  }, { passive: true });
  $(".speak-button").addEventListener("click", event => speak(deck[currentIndex].word, event.currentTarget));
  $(".save-word").addEventListener("click", () => toggleSave(deck[currentIndex].word));
  $(".know-button").addEventListener("click", () => {
    const word = deck[currentIndex].word;
    learned.add(word);
    persist();
    updateStats();
    showToast(`Nice — “${word}” marked as learned!`);
    move(1);
  });
  $(".shuffle-button").addEventListener("click", () => {
    for (let index = deck.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [deck[index], deck[randomIndex]] = [deck[randomIndex], deck[index]];
    }
    currentIndex = 0;
    renderDeck(true);
    showToast("Deck shuffled");
  });
  $(".random-button").addEventListener("click", () => {
    currentIndex = Math.floor(Math.random() * deck.length);
    renderDeck(true);
    $(".study-shell").scrollIntoView({ behavior: "smooth" });
  });

  searchInput.addEventListener("input", () => { visibleCount = 9; renderGrid(); });
  $(".sort-select").addEventListener("change", renderGrid);
  $$(".filter-chip").forEach(chip => chip.addEventListener("click", () => {
    activePart = chip.dataset.part;
    visibleCount = 9;
    $$(".filter-chip").forEach(item => item.classList.toggle("active", item === chip));
    renderGrid();
  }));
  $(".load-more").addEventListener("click", () => { visibleCount += 9; renderGrid(); });
  $(".empty-state button").addEventListener("click", clearFilters);
  $(".saved-button").addEventListener("click", () => {
    savedOnly = !savedOnly;
    clearFilters();
    savedOnly = true;
    renderGrid();
    $(".library").scrollIntoView({ behavior: "smooth" });
  });

  grid.addEventListener("click", event => {
    const card = event.target.closest(".word-card");
    if (!card) return;
    const item = words.find(word => word.word === card.dataset.word);
    if (event.target.closest(".grid-speak")) speak(item.word, event.target.closest(".grid-speak"));
    if (event.target.closest(".grid-save")) toggleSave(item.word);
  });

  document.addEventListener("keydown", event => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
      $(".library").scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (typing) return;
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
    if (event.code === "Space") { event.preventDefault(); reveal(); }
  });

  const themeToggle = $(".theme-toggle");
  const themeIcon = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    themeToggle.setAttribute("aria-label", dark ? "Use light theme" : "Use dark theme");
    themeToggle.innerHTML = dark
      ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 14.7A8.3 8.3 0 0 1 9.3 3.5 8.5 8.5 0 1 0 20.5 14.7Z"/></svg>'
      : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/></svg>';
  };
  const storedTheme = localStorage.getItem("wordly-theme");
  if (storedTheme) document.documentElement.dataset.theme = storedTheme;
  themeIcon();
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("wordly-theme", next);
    themeIcon();
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  updateStats();
  renderDeck();
  renderGrid();
})();
