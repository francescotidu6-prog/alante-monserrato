(function () {
  "use strict";

  var stato = document.getElementById("stato");
  var offline = document.getElementById("offline");
  var errore = document.getElementById("errore");
  var base = new URL("./", window.location.href);

  function percorsoLocale(percorso) {
    return new URL(percorso, base).href;
  }

  function mostraErrore(messaggio) {
    errore.textContent = "Problema: " + messaggio;
  }

  function registraPwa() {
    if (!("serviceWorker" in navigator)) {
      offline.textContent = "Questo browser non supporta l’uso offline.";
      return Promise.resolve();
    }

    return navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .then(function () {
        return navigator.serviceWorker.ready;
      })
      .then(function () {
        offline.textContent = "Pronta per l’uso offline.";
        offline.classList.add("pronto");
      })
      .catch(function (error) {
        offline.textContent = "Preparazione offline non completata.";
        mostraErrore(error.message || String(error));
      });
  }

  function inizializzaMappa() {
    try {
      var protocollo = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocollo.tile);

      var stile = {
        version: 8,
        glyphs: percorsoLocale("fonts/") + "{fontstack}/{range}.pbf",
        sprite: percorsoLocale("sprites/v4/light"),
        sources: {
          protomaps: {
            type: "vector",
            url: "pmtiles://" + percorsoLocale("prova.pmtiles"),
            attribution: "© OpenStreetMap contributors · Protomaps"
          }
        },
        layers: basemaps.layers(
          "protomaps",
          basemaps.namedFlavor("light"),
          { lang: "it" }
        )
      };

      var mappa = new maplibregl.Map({
        container: "map",
        style: stile,
        center: [9.138716, 39.252645],
        zoom: 15.2,
        maxZoom: 19,
        renderWorldCopies: false,
        attributionControl: true
      });

      mappa.addControl(new maplibregl.NavigationControl(), "top-right");
      mappa.on("load", function () {
        stato.textContent = "Mappa caricata.";
      });

      var messaggi = 0;
      mappa.on("error", function (evento) {
        if (messaggi++ < 2) {
          mostraErrore(
            evento && evento.error && evento.error.message
              ? evento.error.message
              : "Errore di caricamento"
          );
        }
      });
    } catch (error) {
      stato.textContent = "Impossibile inizializzare la mappa.";
      mostraErrore(error.message || String(error));
    }
  }

  registraPwa().then(inizializzaMappa);
}());
