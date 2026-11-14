(function () {
  "use strict";

  var DIMENSIONE_PMTILES = 239298;
  var ZOOM_TILE = 15;
  var DIMENSIONE_TILE = 512;
  var COLONNE_TILE = 2;
  var RIGHE_TILE = 1;
  var MARGINE_BORDO = 8;
  var ZOOM_INIZIALE_BASE = 15.2;
  var LIMITI_TILE = [
    [9.129638671875, 39.249270846223],
    [9.151611328125, 39.257778150283]
  ];
  var CENTRO_TILE = [9.140625, 39.253524627276];
  var stato = document.getElementById("stato");
  var offline = document.getElementById("offline");
  var errore = document.getElementById("errore");
  var tornaMappa = document.getElementById("torna-mappa");
  var base = new URL("./", window.location.href);

  function percorsoLocale(percorso) {
    return new URL(percorso, base).href;
  }

  function mostraErrore(contesto, dettaglio) {
    var riga = contesto + (dettaglio ? ": " + dettaglio : "");
    errore.textContent += (errore.textContent ? "\n" : "") + riga;
  }

  function descriviErrore(error) {
    if (!error) {
      return "errore sconosciuto";
    }
    return error.message || String(error);
  }

  function attendiAttivazione(registrazione) {
    var worker = registrazione.installing || registrazione.waiting || registrazione.active;
    if (!worker || worker.state === "activated") {
      return Promise.resolve(registrazione.active || worker);
    }

    return new Promise(function (resolve, reject) {
      var timer = window.setTimeout(function () {
        reject(new Error("service-worker.js non si è attivato"));
      }, 10000);

      worker.addEventListener("statechange", function () {
        if (worker.state === "activated") {
          window.clearTimeout(timer);
          resolve(worker);
        } else if (worker.state === "redundant") {
          window.clearTimeout(timer);
          reject(new Error("service-worker.js è diventato inattivo"));
        }
      });
    });
  }

  function verificaCache(worker) {
    return new Promise(function (resolve, reject) {
      if (!worker) {
        reject(new Error("service-worker.js non disponibile"));
        return;
      }

      var canale = new MessageChannel();
      var timer = window.setTimeout(function () {
        reject(new Error("nessuna risposta da service-worker.js"));
      }, 5000);

      canale.port1.onmessage = function (evento) {
        window.clearTimeout(timer);
        resolve(evento.data || {});
      };
      worker.postMessage({ type: "CHECK_OFFLINE" }, [canale.port2]);
    });
  }

  function registraPwa() {
    if (!("serviceWorker" in navigator)) {
      offline.textContent = "Uso offline non disponibile in questo browser.";
      return;
    }

    offline.textContent = "Verifica della cache offline…";
    navigator.serviceWorker.register("./service-worker.js?v=4", {
      scope: "./",
      updateViaCache: "none"
    })
      .then(attendiAttivazione)
      .then(verificaCache)
      .then(function (esito) {
        if (!esito.ok) {
          var mancanti = esito.missing && esito.missing.length
            ? esito.missing.join(", ")
            : "cache incompleta";
          throw new Error(mancanti);
        }
        offline.textContent = "Pronta per l’uso offline.";
        offline.classList.add("pronto");
      })
      .catch(function (error) {
        offline.textContent = "Uso offline non ancora pronto.";
        offline.classList.remove("pronto");
        mostraErrore("service-worker.js", descriviErrore(error));
      });
  }

  function calcolaZoomMinimo(contenitore) {
    var larghezza = contenitore.clientWidth + MARGINE_BORDO * 2;
    var altezza = contenitore.clientHeight + MARGINE_BORDO * 2;
    var zoomLarghezza = ZOOM_TILE + Math.log(
      larghezza / (COLONNE_TILE * DIMENSIONE_TILE)
    ) / Math.LN2;
    var zoomAltezza = ZOOM_TILE + Math.log(
      altezza / (RIGHE_TILE * DIMENSIONE_TILE)
    ) / Math.LN2;

    return Math.max(14, zoomLarghezza, zoomAltezza);
  }

  function creaMappa(buffer) {
    var file = new File([buffer], "prova.pmtiles", {
      type: "application/octet-stream"
    });
    var archivio = new pmtiles.PMTiles(new pmtiles.FileSource(file));
    var protocollo = new pmtiles.Protocol();
    protocollo.add(archivio);
    maplibregl.addProtocol("pmtiles", protocollo.tile);

    var stile = {
      version: 8,
      glyphs: percorsoLocale("fonts/") + "{fontstack}/{range}.pbf",
      sprite: percorsoLocale("sprites/v4/light"),
      sources: {
        protomaps: {
          type: "vector",
          url: "pmtiles://prova.pmtiles",
          attribution: "© OpenStreetMap contributors · Protomaps"
        }
      },
      layers: basemaps.layers(
        "protomaps",
        basemaps.namedFlavor("light"),
        { lang: "it" }
      )
    };

    var contenitore = document.getElementById("map");
    var zoomMinimo = calcolaZoomMinimo(contenitore);
    var zoomIniziale = Math.max(ZOOM_INIZIALE_BASE, zoomMinimo);
    var mappa = new maplibregl.Map({
      container: "map",
      style: stile,
      center: CENTRO_TILE,
      zoom: zoomIniziale,
      minZoom: zoomMinimo,
      maxZoom: 19,
      maxBounds: LIMITI_TILE,
      renderWorldCopies: false,
      attributionControl: true
    });

    mappa.addControl(new maplibregl.NavigationControl(), "top-right");
    mappa.on("load", function () {
      stato.textContent = "Mappa caricata.";
      tornaMappa.disabled = false;
    });
    mappa.on("error", function (evento) {
      var dettaglio = evento && evento.error
        ? descriviErrore(evento.error)
        : "errore di caricamento";
      var richiesta = evento && evento.error && evento.error.url
        ? evento.error.url
        : (evento && evento.sourceId ? "sorgente " + evento.sourceId : "stile, font o icona");
      mostraErrore(richiesta, dettaglio);
    });

    tornaMappa.addEventListener("click", function () {
      zoomMinimo = calcolaZoomMinimo(contenitore);
      zoomIniziale = Math.max(ZOOM_INIZIALE_BASE, zoomMinimo);
      mappa.setMinZoom(zoomMinimo);
      mappa.setMaxBounds(LIMITI_TILE);
      mappa.easeTo({
        center: CENTRO_TILE,
        zoom: zoomIniziale,
        bearing: 0,
        pitch: 0
      });
    });

    window.addEventListener("resize", function () {
      zoomMinimo = calcolaZoomMinimo(contenitore);
      zoomIniziale = Math.max(ZOOM_INIZIALE_BASE, zoomMinimo);
      mappa.setMinZoom(zoomMinimo);
      mappa.setMaxBounds(LIMITI_TILE);
      if (mappa.getZoom() < zoomMinimo) {
        mappa.jumpTo({ center: CENTRO_TILE, zoom: zoomMinimo });
      }
    });
  }

  function inizializzaMappa() {
    var url = percorsoLocale("prova.pmtiles");
    stato.textContent = "Caricamento di prova.pmtiles…";

    fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("richiesta " + url + " — HTTP " + response.status);
        }
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        if (buffer.byteLength !== DIMENSIONE_PMTILES) {
          throw new Error(
            "dimensione errata: " + buffer.byteLength + " byte; attesi " + DIMENSIONE_PMTILES
          );
        }
        creaMappa(buffer);
      })
      .catch(function (error) {
        stato.textContent = "Mappa non caricata.";
        mostraErrore("prova.pmtiles", descriviErrore(error));
      });
  }

  window.addEventListener("error", function (evento) {
    mostraErrore(evento.filename || "JavaScript", evento.message || "errore non gestito");
  });
  window.addEventListener("unhandledrejection", function (evento) {
    mostraErrore("Promise", descriviErrore(evento.reason));
  });

  inizializzaMappa();
  registraPwa();
}());
