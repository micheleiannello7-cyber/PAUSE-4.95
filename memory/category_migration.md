# Riorganizzazione approvata — Curiosità

Richiesta confermata dall'utente: eliminare la categoria generica e redistribuire
i suoi contenuti senza perdere storie, salvataggi, preferenze o progressi.

## Risultato atteso
- 437 contenuti totali invariati: spostate18storie e10lezioni, nessuna cancellazione.
- 12categorie attive. Il badge «Curiosità» delle storie è un tipo di contenuto,
  non la categoria ritirata: resta intenzionalmente distinto dalle Mini lezioni.
- Gli ID originali (anche `cur-*`) restano identici per link, lettura e preferiti.

## Assegnazioni editoriali
La mappa completa verificabile è `backend/category_taxonomy.py:REASSIGNMENTS`.

| Categoria | Contenuti spostati | Criterio |
|---|---:|---|
| Scienza |18|Fisica, chimica, ottica, probabilità e matematica applicata|
| Animali |2|Fusa dei gatti, strisce delle zebre|
| Psicologia |2|Percezione del tempo e coincidenze/bias|
| Tecnologia |2|QWERTY e numeri primi nella crittografia|
| Corpo umano |1|Mancinismo|
| Geografia |1|Fusi orari|
| Natura |1|Difesa chimica della cipolla|
| Spazio |1|Paradosso di Olbers|

## Sicurezza dei dati
- Backup persistenti MongoDB `taxonomy_backups`, migration=`retire-curiosita-v1`,
  kind=story/category/user_state. Scritti **prima** di ogni modifica.
- Solo i metadati categoria cambiano nelle storie e traduzioni. Titoli, testi,
  capitoli, cover, audio e tutti i riferimenti per ID restano invariati.
- Preferenze/unlocked_categories contenenti `curiosita` espanse alle destinazioni,
  deduplicate; `all` resta esclusivo. Salvataggi, like, minuti e progressi non toccati.
- Migrazione idempotente e riprendibile. Contenuti non mappati fanno fallire la
  migrazione prima delle scritture: nessuna riclassificazione arbitraria nascosta.
- Seed normalizzato, inclusi pack lezioni; il riavvio non ricrea la categoria.
- Vecchi POST interessi/GET discovery sono compatibili; la vecchia lista per
  categoria restituisce gli stessi ID riclassificati. Nessun link storia cambia.
- Snapshot di lettura in AsyncStorage aggiornato da API quando ancora marcato
  `curiosita`, conservando pagina/progresso. Offline non viene cancellato nulla.

## Verifiche concluse
Iteration25:12/12test passati, inclusi confronto integrale prima/dopo dei28documenti
(esclusi soltanto i metadati categoria), stato utenti, backup, aliasAPI e test
isolati di doppia esecuzione/ID sconosciuto. Non risultano contenuti persi.