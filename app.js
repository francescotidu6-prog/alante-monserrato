(function () {
  "use strict";

  var DIMENSIONE_PMTILES = 239298;
  var ZOOM_DATI_MIN = 14;
  var ZOOM_DATI_MAX = 15;
  var ZOOM_MAPPA_MAX = 17;
  var ZOOM_TILE = ZOOM_DATI_MAX;
  var DIMENSIONE_TILE = 512;
  var COLONNE_TILE = 2;
  var RIGHE_TILE = 1;
  var MARGINE_BORDO = 8;
  var ZOOM_INIZIALE_BASE = 15.2;
  var CENTRO_RECINTO = { latitudine: 39.252645, longitudine: 9.138716 };
  var RAGGIO_RECINTO = 40;
  var PRECISIONE_MASSIMA = 40;
  var LETTURE_RICHIESTE = 3;
  var CHIAVE_SBLOCCO = "monserrato-sa-crugi-marmuri-1603";
  var LIMITI_TILE = [
    [9.129638671875, 39.249270846223],
    [9.151611328125, 39.257778150283]
  ];
  var CENTRO_TILE = [9.140625, 39.253524627276];
  var stato = document.getElementById("stato");
  var offline = document.getElementById("offline");
  var errore = document.getElementById("errore");
  var tornaMappa = document.getElementById("torna-mappa");
  var attivaGps = document.getElementById("attiva-gps");
  var gpsStato = document.getElementById("gps-stato");
  var gpsDistanza = document.getElementById("gps-distanza");
  var gpsPrecisione = document.getElementById("gps-precisione");
  var storiaSbloccata = document.getElementById("storia-sbloccata");
  var base = new URL("./", window.location.href);
  var watchGps = null;
  var lettureConsecutive = 0;
  var sbloccoRegistrato = false;

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
    navigator.serviceWorker.register("./service-worker.js?v=6", {
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

  function radianti(gradi) {
    return gradi * Math.PI / 180;
  }

  function gradi(radiantiValore) {
    return radiantiValore * 180 / Math.PI;
  }

  function creaCerchioGeoJson() {
    var coordinate = [];
    var raggioTerrestre = 6371008.8;
    var distanzaAngolare = RAGGIO_RECINTO / raggioTerrestre;
    var latitudine = radianti(CENTRO_RECINTO.latitudine);
    var longitudine = radianti(CENTRO_RECINTO.longitudine);
    var segmenti = 64;

    for (var indice = 0; indice <= segmenti; indice += 1) {
      var direzione = indice / segmenti * Math.PI * 2;
      var latitudinePunto = Math.asin(
        Math.sin(latitudine) * Math.cos(distanzaAngolare) +
        Math.cos(latitudine) * Math.sin(distanzaAngolare) * Math.cos(direzione)
      );
      var longitudinePunto = longitudine + Math.atan2(
        Math.sin(direzione) * Math.sin(distanzaAngolare) * Math.cos(latitudine),
        Math.cos(distanzaAngolare) - Math.sin(latitudine) * Math.sin(latitudinePunto)
      );
      coordinate.push([gradi(longitudinePunto), gradi(latitudinePunto)]);
    }

    return {
      type: "Feature",
      properties: { nome: "Sa Crugi 'e Marmuri", raggio: RAGGIO_RECINTO },
      geometry: { type: "Polygon", coordinates: [coordinate] }
    };
  }

  function aggiungiRecinto(mappa) {
    mappa.addSource("recinto-sa-crugi", {
      type: "geojson",
      data: creaCerchioGeoJson()
    });
    mappa.addLayer({
      id: "recinto-sa-crugi-riempimento",
      type: "fill",
      source: "recinto-sa-crugi",
      paint: {
        "fill-color": "#d98324",
        "fill-opacity": 0.2
      }
    });
    mappa.addLayer({
      id: "recinto-sa-crugi-bordo",
      type: "line",
      source: "recinto-sa-crugi",
      paint: {
        "line-color": "#b45f06",
        "line-width": 3
      }
    });
  }

  function distanzaInMetri(latitudine, longitudine) {
    var raggioTerrestre = 6371008.8;
    var latitudine1 = radianti(latitudine);
    var latitudine2 = radianti(CENTRO_RECINTO.latitudine);
    var differenzaLatitudine = latitudine2 - latitudine1;
    var differenzaLongitudine = radianti(CENTRO_RECINTO.longitudine - longitudine);
    var a = Math.sin(differenzaLatitudine / 2) * Math.sin(differenzaLatitudine / 2) +
      Math.cos(latitudine1) * Math.cos(latitudine2) *
      Math.sin(differenzaLongitudine / 2) * Math.sin(differenzaLongitudine / 2);
    return raggioTerrestre * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function mostraSblocco() {
    storiaSbloccata.hidden = false;
  }

  function salvaSblocco() {
    try {
      window.localStorage.setItem(CHIAVE_SBLOCCO, "1");
    } catch (error) {
      mostraErrore("Salvataggio storia", descriviErrore(error));
    }
  }

  function fermaGps(messaggio) {
    if (watchGps !== null) {
      navigator.geolocation.clearWatch(watchGps);
      watchGps = null;
    }
    lettureConsecutive = 0;
    if (sbloccoRegistrato) {
      attivaGps.textContent = "Storia sbloccata";
      attivaGps.disabled = true;
    } else {
      attivaGps.textContent = "Attiva GPS";
      attivaGps.disabled = false;
    }
    if (messaggio) {
      gpsStato.textContent = messaggio;
    }
  }

  function sbloccaStoria() {
    if (sbloccoRegistrato) {
      return;
    }
    sbloccoRegistrato = true;
    salvaSblocco();
    mostraSblocco();
    fermaGps("Storia sbloccata.");
  }

  function gestisciPosizione(posizione) {
    var coordinate = posizione.coords;
    var distanza = distanzaInMetri(coordinate.latitude, coordinate.longitude);
    var precisione = coordinate.accuracy;

    gpsDistanza.textContent = Math.round(distanza) + " m";
    gpsPrecisione.textContent = Math.round(precisione) + " m";

    if (precisione > PRECISIONE_MASSIMA) {
      gpsStato.textContent = "Lettura scartata: precisione peggiore di 40 m.";
      return;
    }

    if (distanza <= RAGGIO_RECINTO) {
      lettureConsecutive += 1;
      gpsStato.textContent = "Dentro il recinto: " + lettureConsecutive + "/" + LETTURE_RICHIESTE + ".";
      if (lettureConsecutive >= LETTURE_RICHIESTE) {
        sbloccaStoria();
      }
    } else {
      lettureConsecutive = 0;
      gpsStato.textContent = "Fuori dal recinto.";
    }
  }

  function gestisciErroreGps(error) {
    var messaggio;
    if (error.code === 1) {
      messaggio = "Permesso GPS negato. Abilita la posizione nelle impostazioni dell’iPhone.";
    } else if (error.code === 2) {
      messaggio = "Posizione non disponibile. Spostati all’aperto e riprova.";
    } else if (error.code === 3) {
      messaggio = "Tempo di attesa GPS scaduto. Riprova.";
    } else {
      messaggio = "Errore GPS: " + descriviErrore(error);
    }
    fermaGps(messaggio);
  }

  function avviaGps() {
    if (sbloccoRegistrato || watchGps !== null) {
      return;
    }
    if (!("geolocation" in navigator)) {
      gpsStato.textContent = "GPS non supportato da questo dispositivo.";
      return;
    }

    attivaGps.disabled = true;
    attivaGps.textContent = "GPS attivo…";
    gpsStato.textContent = "Ricerca della posizione…";
    lettureConsecutive = 0;
    watchGps = navigator.geolocation.watchPosition(
      gestisciPosizione,
      gestisciErroreGps,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  function ripristinaSblocco() {
    try {
      sbloccoRegistrato = window.localStorage.getItem(CHIAVE_SBLOCCO) === "1";
    } catch (error) {
      sbloccoRegistrato = false;
    }
    if (sbloccoRegistrato) {
      mostraSblocco();
      fermaGps("Storia già sbloccata su questo dispositivo.");
    }
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
          minzoom: ZOOM_DATI_MIN,
          maxzoom: ZOOM_DATI_MAX,
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
      maxZoom: ZOOM_MAPPA_MAX,
      maxBounds: LIMITI_TILE,
      renderWorldCopies: false,
      attributionControl: true
    });

    mappa.addControl(new maplibregl.NavigationControl(), "top-right");
    mappa.on("load", function () {
      aggiungiRecinto(mappa);
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

  attivaGps.addEventListener("click", avviaGps);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && watchGps !== null) {
      fermaGps("GPS sospeso. Premi Attiva GPS per riprendere.");
    }
  });
  window.addEventListener("pagehide", function () {
    if (watchGps !== null) {
      fermaGps();
    }
  });

  ripristinaSblocco();
  inizializzaMappa();
  registraPwa();
}());
