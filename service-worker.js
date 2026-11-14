"use strict";

var CACHE_NAME = "monserrato-pwa-v2";
var DIMENSIONE_PMTILES = 239298;
var FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/maplibre-gl.css",
  "./vendor/maplibre-gl.js",
  "./vendor/pmtiles.js",
  "./vendor/basemaps.js",
  "./prova.pmtiles",
  "./sprites/v4/light.json",
  "./sprites/v4/light.png",
  "./sprites/v4/light@2x.json",
  "./sprites/v4/light@2x.png",
  "./fonts/Noto%20Sans%20Regular/0-255.pbf",
  "./fonts/Noto%20Sans%20Regular/256-511.pbf",
  "./fonts/Noto%20Sans%20Medium/0-255.pbf",
  "./fonts/Noto%20Sans%20Medium/256-511.pbf",
  "./fonts/Noto%20Sans%20Italic/0-255.pbf",
  "./fonts/Noto%20Sans%20Italic/256-511.pbf"
];

function urlLocale(percorso) {
  return new URL(percorso, self.location.href).href;
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(FILES.map(function (percorso) {
          var url = urlLocale(percorso);
          return fetch(url, { cache: "reload" })
            .then(function (response) {
              if (!response.ok) {
                throw new Error(url + " — HTTP " + response.status);
              }
              return cache.put(url, response);
            })
            .catch(function () {
              return null;
            });
        }));
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

function verificaCache() {
  return caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(FILES.map(function (percorso) {
      return cache.match(urlLocale(percorso)).then(function (response) {
        return response ? null : percorso;
      });
    })).then(function (risultati) {
      var mancanti = risultati.filter(function (risultato) {
        return risultato !== null;
      });

      return cache.match(urlLocale("./prova.pmtiles")).then(function (response) {
        if (!response) {
          return { ok: false, missing: mancanti, pmtilesSize: 0, cache: CACHE_NAME };
        }
        return response.clone().arrayBuffer().then(function (buffer) {
          if (buffer.byteLength !== DIMENSIONE_PMTILES) {
            mancanti.push("./prova.pmtiles (dimensione " + buffer.byteLength + ")");
          }
          return {
            ok: mancanti.length === 0,
            missing: mancanti,
            pmtilesSize: buffer.byteLength,
            cache: CACHE_NAME
          };
        });
      });
    });
  });
}

self.addEventListener("message", function (event) {
  if (!event.data || event.data.type !== "CHECK_OFFLINE" || !event.ports[0]) {
    return;
  }
  event.waitUntil(
    verificaCache()
      .then(function (esito) {
        event.ports[0].postMessage(esito);
      })
      .catch(function (error) {
        event.ports[0].postMessage({
          ok: false,
          missing: ["service-worker.js: " + (error.message || String(error))],
          cache: CACHE_NAME
        });
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (nomi) {
        return Promise.all(
          nomi.filter(function (nome) {
            return nome.indexOf("monserrato-pwa-") === 0 && nome !== CACHE_NAME;
          }).map(function (nome) {
            return caches.delete(nome);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function rispostaParziale(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(new Request(request.url)).then(function (response) {
      if (!response) {
        return fetch(request);
      }

      return response.arrayBuffer().then(function (buffer) {
        var dimensione = buffer.byteLength;
        var valore = request.headers.get("range") || "";
        var parti = /^bytes=(\d+)-(\d*)$/.exec(valore);

        if (!parti) {
          return new Response(buffer, {
            status: 200,
            headers: response.headers
          });
        }

        var inizio = Number(parti[1]);
        var fine = parti[2] ? Number(parti[2]) : dimensione - 1;
        fine = Math.min(fine, dimensione - 1);

        if (inizio >= dimensione || inizio > fine) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": "bytes */" + dimensione }
          });
        }

        var headers = new Headers(response.headers);
        headers.delete("Content-Encoding");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Length", String(fine - inizio + 1));
        headers.set("Content-Range", "bytes " + inizio + "-" + fine + "/" + dimensione);

        return new Response(buffer.slice(inizio, fine + 1), {
          status: 206,
          statusText: "Partial Content",
          headers: headers
        });
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.headers.has("range")) {
    event.respondWith(rispostaParziale(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request);
    })
  );
});
