# Monserrato - PWA offline

Questa cartella e' un sito statico completo. Non richiede database o servizi a pagamento.

## Pubblicazione manuale

1. Creare un repository GitHub vuoto.
2. Caricare nella radice del repository tutto il contenuto di questa cartella.
3. In GitHub aprire Settings, Pages.
4. Scegliere Deploy from a branch, ramo `main`, cartella `/ (root)`.
5. Attendere l'indirizzo HTTPS fornito da GitHub Pages.

## Installazione su iPhone

1. Aprire l'indirizzo GitHub Pages in Safari mentre si e' online.
2. Attendere la scritta `Pronta per l'uso offline`.
3. Toccare Condividi, poi Aggiungi alla schermata Home.
4. Aprire la mappa dalla nuova icona almeno una volta.
5. Disattivare Wi-Fi e dati mobili, chiudere e riaprire la PWA per il test offline.

## Aggiornamenti

Quando si modifica un file, aumentare il numero in `CACHE_NAME` dentro `service-worker.js`.
