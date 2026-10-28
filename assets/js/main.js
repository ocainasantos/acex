(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const setText = (element, value) => { if (element) element.textContent = value; };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Header e menu */
  const header = $(".site-header");
  const menu = $("#menu");
  const toggle = $(".nav-toggle");

  const setMenu = (open) => {
    if (!menu || !toggle) return;
    menu.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu de navegação" : "Abrir menu de navegação");
  };

  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 8);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
  }

  if (menu && toggle) {
    toggle.addEventListener("click", () => setMenu(!menu.classList.contains("is-open")));
    menu.addEventListener("click", (event) => { if (event.target.closest("a")) setMenu(false); });
    addEventListener("keydown", (event) => { if (event.key === "Escape") setMenu(false); });
    addEventListener("resize", () => { if (innerWidth > 820) setMenu(false); });
  }

  /* Revelação ao rolar */
  const revealItems = $$(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const item = entry.target;
        const index = [...item.parentElement.children].indexOf(item);
        item.style.transitionDelay = `${Math.min(index, 5) * 70}ms`;
        item.classList.add("is-visible");
        reveal.unobserve(item);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });

    revealItems.forEach((item) => reveal.observe(item));
  }

  document.documentElement.classList.add("reveal-ready");

  /* Link ativo conforme a seção visível */
  const navLinks = $$('.nav a[href^="#"]');
  const linksBySection = new Map(navLinks.map((link) => [link.hash.slice(1), link]));

  if (linksBySection.size && "IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          link.classList.remove("is-active");
          link.removeAttribute("aria-current");
        });
        const active = linksBySection.get(entry.target.id);
        if (active) {
          active.classList.add("is-active");
          active.setAttribute("aria-current", "true");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    linksBySection.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  setText($("#ano"), String(new Date().getFullYear()));

  /* Elementos da interface */
  const hero = {
    local: $("#hero-local"), soil: $("#hero-soil"), rain: $("#hero-rain"),
    soilTemp: $("#hero-soiltemp"), coords: $("#hero-coords"), bars: $("#hero-bars"),
    visual: $(".hero-visual"), updated: $("#chip-updated"), condition: $("#chip-condition")
  };

  const local = {
    name: $("#local-nome"), coords: $("#local-coords"), tz: $("#local-tz"),
    updated: $("#local-updated"), map: $("#local-map"), status: $("#loc-status"),
    form: $("#loc-form"), input: $("#loc-input"), results: $("#loc-results"),
    gps: $("#loc-gps"), refresh: $("#loc-refresh")
  };

  const panel = {
    root: $("#live-panel"), coords: $("#panel-coords"), local: $("#panel-local"),
    condition: $("#panel-condition"), soil: $("#panel-soil"), rain: $("#panel-rain"),
    soilTemp: $("#panel-soiltemp"), chart: $("#panel-chart"), bars: $("#panel-bars"),
    alert: $("#panel-alert-text"), caption: $("#panel-caption")
  };

  if (!panel.root) return;

  const DEFAULT_LOCATION = {
    name: "Toledo – PR, Brasil", short: "Toledo – PR",
    latitude: -24.7136, longitude: -53.7431
  };

  const REFRESH_MS = 10 * 60 * 1000;
  const state = {
    location: { ...DEFAULT_LOCATION }, data: null,
    fetchedAt: 0, requestId: 0, controller: null
  };

  const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const fmt1 = (value) => Number.isFinite(value) ? nf1.format(value) : "—";
  const fmt0 = (value) => Number.isFinite(value) ? nf0.format(value) : "—";

  const coordLabel = (lat, lon) =>
    `${Math.abs(lat).toFixed(3).replace(".", ",")}° ${lat >= 0 ? "N" : "S"} · ` +
    `${Math.abs(lon).toFixed(3).replace(".", ",")}°\u00A0${lon >= 0 ? "L" : "O"}`;

  const localStamp = (iso) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || "");
    return match ? `${match[3]}/${match[2]} ${match[4]}:${match[5]}` : "—";
  };

  const localTime = (iso) => iso?.match(/T(\d{2}:\d{2})/)?.[1] || "—";
  const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const dayLabel = (iso) => {
    const date = new Date(`${iso}T12:00:00`);
    return Number.isNaN(date.getTime()) ? "" : WEEK[date.getDay()];
  };

  const WMO = {
    0: "Céu limpo", 1: "Predomínio de sol", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Nevoeiro", 48: "Nevoeiro com geada",
    51: "Chuvisco fraco", 53: "Chuvisco", 55: "Chuvisco forte",
    56: "Chuvisco congelante", 57: "Chuvisco congelante forte",
    61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte",
    66: "Chuva congelante", 67: "Chuva congelante forte",
    71: "Neve fraca", 73: "Neve", 75: "Neve forte", 77: "Grãos de neve",
    80: "Pancadas de chuva", 81: "Pancadas de chuva", 82: "Pancadas fortes de chuva",
    85: "Pancadas de neve", 86: "Pancadas fortes de neve",
    95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade com granizo forte"
  };

  const forecastUrl = (place) => {
    const params = new URLSearchParams({
      latitude: place.latitude.toFixed(4),
      longitude: place.longitude.toFixed(4),
      current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
      hourly: "soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_temperature_6cm",
      daily: "precipitation_sum,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "7"
    });
    return `https://api.open-meteo.com/v1/forecast?${params}`;
  };

  const buildModel = (json) => {
    const hourly = json.hourly || {};
    const daily = json.daily || {};
    const current = json.current || {};
    const times = hourly.time || [];
    const now = current.time || times[0] || "";
    let index = 0;

    times.forEach((time, i) => { if (time <= now) index = i; });

    let weighted = 0;
    let thickness = 0;
    [[0, 1], [1, 3], [3, 9], [9, 27]].forEach(([from, to]) => {
      const value = hourly[`soil_moisture_${from}_to_${to}cm`]?.[index];
      if (Number.isFinite(value)) {
        weighted += value * (to - from);
        thickness += to - from;
      }
    });

    const rainDays = (daily.time || []).map((date, i) => ({
      date,
      label: dayLabel(date),
      mm: Number.isFinite(daily.precipitation_sum?.[i]) ? daily.precipitation_sum[i] : 0,
      chance: Number.isFinite(daily.precipitation_probability_max?.[i])
        ? daily.precipitation_probability_max[i]
        : null
    }));

    return {
      soilMoisture: thickness ? (weighted / thickness) * 100 : null,
      soilTemp: Number.isFinite(hourly.soil_temperature_6cm?.[index]) ? hourly.soil_temperature_6cm[index] : null,
      rainDays,
      rainTotal: rainDays.reduce((total, day) => total + day.mm, 0),
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      weatherCode: current.weather_code,
      time: now,
      timezone: json.timezone || ""
    };
  };

  const conditionText = (model) =>
    `${WMO[model.weatherCode] || "Condição não informada"} · ${fmt1(model.temperature)} °C`;

  const buildAlert = (model) => {
    const soil = model.soilMoisture == null ? "" : ` Solo em ${fmt0(model.soilMoisture)}% de umidade.`;
    if (model.rainTotal >= 40) return `Chuva prevista de ${fmt1(model.rainTotal)} mm nos próximos 7 dias — atenção à drenagem e ao trânsito de máquinas.${soil}`;
    if (model.rainTotal >= 10) return `Previsão de ${fmt1(model.rainTotal)} mm em 7 dias: volume moderado, bom para acompanhar a umidade do solo.${soil}`;
    if (model.rainTotal > 0) return `Apenas ${fmt1(model.rainTotal)} mm previstos em 7 dias — acompanhe a umidade do solo e planeje a irrigação.${soil}`;
    return `Sem chuva prevista para os próximos 7 dias — atenção à umidade do solo e à irrigação.${soil}`;
  };

  const renderBars = (container, days, { compact = false, metric = "rain" } = {}) => {
    if (!container) return;

    const chance = metric === "chance";
    const values = days.map((day) => chance ? (day.chance ?? 0) : day.mm);
    const max = Math.max(chance ? 100 : 1, ...values);
    container.replaceChildren();

    days.forEach((day, i) => {
      const height = `${Math.max(chance ? 1 : 2, (values[i] / max) * 100).toFixed(1)}%`;
      const title = chance
        ? `${day.label}: ${fmt0(values[i])}% de chance de chuva`
        : `${day.label}: ${fmt1(day.mm)} mm${day.chance != null ? ` · ${day.chance}% de chance` : ""}`;

      if (compact) {
        const bar = document.createElement("span");
        bar.style.setProperty("--h", height);
        bar.title = title;
        container.append(bar);
        return;
      }

      const column = document.createElement("div");
      column.className = "bar-col";
      column.title = title;
      column.innerHTML = `<span class="bar-val">${day.mm === 0 ? "0" : fmt1(day.mm)}</span>` +
        `<span class="bar" style="--h:${height}"></span><span class="bar-day">${day.label}</span>`;
      container.append(column);
    });
  };

  const setStatus = (message, isError = false) => {
    if (!local.status) return;
    local.status.textContent = message;
    local.status.classList.toggle("is-error", isError);
  };

  const setLoading = (loading) => {
    [panel.root, hero.visual].forEach((element) => element?.classList.toggle("is-loading", loading));
  };

  const render = (model) => {
    const place = state.location;
    const condition = conditionText(model);
    const coords = coordLabel(place.latitude, place.longitude);

    setText(hero.local, place.short || place.name);
    setText(hero.soil, fmt0(model.soilMoisture));
    setText(hero.rain, `${fmt1(model.rainTotal)} mm`);
    setText(hero.soilTemp, `${fmt0(model.soilTemp)} °C`);
    setText(hero.coords, coords);
    setText(hero.updated, `Atualizado às ${localTime(model.time)}`);
    setText(hero.condition, condition);

    setText(local.name, place.name);
    setText(local.coords, coords);
    setText(local.tz, model.timezone || "—");
    setText(local.updated, `${localStamp(model.time)} (local)`);
    if (local.map) {
      local.map.href = `https://www.openstreetmap.org/?mlat=${place.latitude.toFixed(5)}` +
        `&mlon=${place.longitude.toFixed(5)}#map=12/${place.latitude.toFixed(5)}/${place.longitude.toFixed(5)}`;
    }

    setText(panel.coords, `${coords} · ${model.timezone || "fuso local"}`);
    setText(panel.local, place.name);
    setText(panel.condition, condition);
    setText(panel.soil, `${fmt0(model.soilMoisture)}%`);
    setText(panel.rain, `${fmt1(model.rainTotal)} mm`);
    setText(panel.soilTemp, `${fmt0(model.soilTemp)} °C`);

    renderBars(hero.bars, model.rainDays, { compact: true, metric: "chance" });
    renderBars(panel.bars, model.rainDays);
    panel.chart?.setAttribute(
      "aria-label",
      `Chuva prevista por dia: ${model.rainDays.map((day) => `${day.label}, ${fmt1(day.mm)} milímetros`).join("; ")}`
    );
    setText(panel.alert, buildAlert(model));
    setText(panel.caption,
      `Fonte: Open-Meteo · ${place.name} · leitura de ${localStamp(model.time)} (horário local). ` +
      "Umidade do solo: média ponderada das camadas 0–1, 1–3, 3–9 e 9–27 cm."
    );

    setStatus(`Dados de ${place.name} carregados da Open-Meteo. Atualização automática a cada 10 minutos.`);
  };

  const syncUrl = (place) => {
    try {
      const url = new URL(location.href);
      url.searchParams.set("lat", place.latitude.toFixed(4));
      url.searchParams.set("lon", place.longitude.toFixed(4));
      url.searchParams.set("local", place.name);
      history.replaceState(null, "", url);
    } catch {
      /* file:// ou navegador sem suporte: mantém a URL atual */
    }
  };

  const readUrlLocation = () => {
    try {
      const params = new URLSearchParams(location.search);
      const latParam = params.get("lat");
      const lonParam = params.get("lon");
      if (latParam === null || lonParam === null) return null;

      const latitude = Number(latParam);
      const longitude = Number(lonParam);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

      const name = params.get("local") || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      return {
        name,
        short: name.split(",")[0].split("–")[0].trim(),
        latitude,
        longitude
      };
    } catch {
      return null;
    }
  };

  const load = async (place, { silent = false } = {}) => {
    const requestId = ++state.requestId;
    state.location = { ...place };
    state.controller?.abort();

    const controller = new AbortController();
    state.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);

    setLoading(true);
    if (!silent) {
      setStatus(`Consultando a Open-Meteo para ${place.short || place.name}…`);
      setText(panel.alert, "Consultando a API Open-Meteo…");
      setText(panel.condition, "consultando…");
      setText(hero.condition, "consultando…");
    }

    try {
      const response = await fetch(forecastUrl(place), {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      if (requestId !== state.requestId) return;

      const model = buildModel(json);
      state.data = model;
      state.fetchedAt = Date.now();
      render(model);
      setLoading(false);
      syncUrl(place);
    } catch {
      if (requestId !== state.requestId) return;
      setLoading(false);
      setStatus(
        `Não foi possível carregar os dados de ${place.name}. Verifique a conexão e use “Atualizar”.`,
        true
      );

      if (!state.data || !silent) {
        setText(panel.alert, "Falha ao consultar a Open-Meteo. Nenhum dado foi inventado — tente atualizar em instantes.");
        setText(panel.condition, "sem conexão");
        setText(hero.condition, "sem conexão");
        setText(panel.caption, "Fonte: Open-Meteo. Não foi possível concluir a consulta.");
      }
    } finally {
      clearTimeout(timeout);
    }
  };

  /* Busca de cidade */
  const renderResults = (places) => {
    local.results.replaceChildren();

    places.forEach((place) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";

      const name = document.createElement("span");
      name.textContent = place.name;

      const meta = document.createElement("small");
      meta.textContent = [place.admin1, place.country].filter(Boolean).join(", ");

      button.append(name, meta);
      button.addEventListener("click", () => {
        local.results.hidden = true;
        local.results.replaceChildren();
        local.input.value = "";
        load({
          name: `${place.name}${place.admin1 ? ` – ${place.admin1}` : ""}${place.country ? `, ${place.country}` : ""}`,
          short: place.name,
          latitude: place.latitude,
          longitude: place.longitude
        });
      });

      item.append(button);
      local.results.append(item);
    });

    local.results.hidden = false;
  };

  const searchPlace = async (term) => {
    local.results.hidden = true;
    local.results.replaceChildren();
    setStatus(`Buscando “${term}”…`);

    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=6&language=pt&format=json`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      const results = (json.results || []).sort(
        (a, b) => Number(b.country_code === "BR") - Number(a.country_code === "BR")
      );

      if (!results.length) {
        setStatus(`Nenhum lugar encontrado para “${term}”. Tente outro nome.`, true);
        return;
      }

      renderResults(results);
      setStatus(`${results.length} resultado(s) para “${term}”. Escolha o lugar correto.`);
    } catch {
      setStatus("Não foi possível buscar lugares agora. Verifique a conexão e tente novamente.", true);
    }
  };

  /* Geolocalização */
  const reverseName = async (latitude, longitude) => {
    const fallback = {
      name: `Minha localização (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
      short: "Minha localização",
      latitude,
      longitude
    };

    try {
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}` +
        `&longitude=${longitude}&localityLanguage=pt`
      );
      if (!response.ok) return fallback;

      const json = await response.json();
      const city = json.city || json.locality || json.principalSubdivision;
      if (!city) return fallback;

      const stateName = json.principalSubdivision && json.principalSubdivision !== city
        ? json.principalSubdivision
        : "";
      const country = json.countryName || "";

      return {
        name: `${city}${stateName ? ` – ${stateName}` : ""}${country ? `, ${country}` : ""}`,
        short: city,
        latitude,
        longitude
      };
    } catch {
      return fallback;
    }
  };

  const useMyLocation = (silent = false) => {
    if (!navigator.geolocation) {
      setStatus("Este navegador não oferece geolocalização. Escolha uma cidade acima.", true);
      return;
    }

    if (!silent) setStatus("Pedindo permissão para usar sua localização…");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setStatus("Localização obtida. Identificando o município…");
        reverseName(coords.latitude, coords.longitude).then(load);
      },
      (error) => {
        if (silent) {
          load(DEFAULT_LOCATION);
          return;
        }
        setStatus(
          error?.code === 1
            ? "Permissão de localização negada. Escolha uma cidade acima."
            : "Não foi possível obter sua localização. Escolha uma cidade acima.",
          true
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const permissionState = () => {
    try {
      return navigator.permissions?.query
        ? navigator.permissions.query({ name: "geolocation" })
            .then((status) => status.state)
            .catch(() => "prompt")
        : Promise.resolve("prompt");
    } catch {
      return Promise.resolve("prompt");
    }
  };

  /* Eventos */
  local.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const term = local.input.value.trim();
    if (term.length < 2) {
      setStatus("Digite ao menos duas letras para buscar uma cidade.", true);
      local.input.focus();
      return;
    }
    searchPlace(term);
  });

  local.input?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      local.results.hidden = true;
      local.input.value = "";
    }
  });

  local.gps?.addEventListener("click", () => useMyLocation());
  local.refresh?.addEventListener("click", () => load(state.location));

  const boot = () => {
    const shared = readUrlLocation();
    if (shared) {
      load(shared);
      return;
    }

    permissionState().then((permission) => {
      if (permission === "granted") {
        setStatus("Usando sua localização…");
        useMyLocation(true);
      } else {
        load(DEFAULT_LOCATION);
      }
    });
  };

  boot();

  setInterval(() => {
    if (document.visibilityState === "visible" && state.data) {
      load(state.location, { silent: true });
    }
  }, REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.data && Date.now() - state.fetchedAt > REFRESH_MS) {
      load(state.location, { silent: true });
    }
  });
})();
