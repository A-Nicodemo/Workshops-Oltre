/* ============================================================
   CONFIGURAZIONE — incolla qui l'URL del Web App di Apps Script
   (vedi istruzioni Code.gs) prima di pubblicare su GitHub Pages.
   ============================================================ */
const ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbz9FNzRtd3nfWnljtZDJLCI4Cw7j8-RBvo0yCXB-Vht_t5uYYSG5bQO0ld7C1udbhf1/exec";

/* ============================================================
   SELEZIONE LABORATORI E PREZZO
   ============================================================ */
const PREZZI = { ws21: 8, ws22: 6 };

function aggiornaTotale() {
  const ws21 = document.getElementById('ws21').checked;
  const ws22 = document.getElementById('ws22').checked;
  const totale = (ws21 ? PREZZI.ws21 : 0) + (ws22 ? PREZZI.ws22 : 0);
  const totBox = document.getElementById('wsTotal');

  if (!ws21 && !ws22) {
    totBox.textContent = 'Seleziona almeno un laboratorio';
    totBox.classList.remove('ready');
  } else {
    const giorni = [];
    if (ws21) giorni.push('21/7');
    if (ws22) giorni.push('22/7');
    totBox.textContent = `${giorni.join(' + ')} — Totale: €${totale}`;
    totBox.classList.add('ready');
    document.getElementById('workshopPicker').classList.remove('invalid');
    document.getElementById('wsErr').classList.remove('show');
  }
  return totale;
}

document.getElementById('ws21').addEventListener('change', aggiornaTotale);
document.getElementById('ws22').addEventListener('change', aggiornaTotale);

/* ============================================================
   AUTOCOMPLETE COMUNI
   COMUNI_DATA è un array di [nome, sigla, codiceCatastale]
   caricato da comuni_data.js
   ============================================================ */
function normalizza(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function setupAutocomplete(inputId, listId, hiddenLabelId, onSelect) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  const hiddenLabel = hiddenLabelId ? document.getElementById(hiddenLabelId) : null;
  let activeIndex = -1;
  let currentMatches = [];

  function render(matches) {
    currentMatches = matches;
    activeIndex = -1;
    if (matches.length === 0) {
      list.innerHTML = '<div class="ac-empty">Nessun comune trovato</div>';
    } else {
      list.innerHTML = matches.map((m, i) =>
        `<div class="ac-item" data-i="${i}">${m[0]} <span style="color:var(--ink-soft);font-weight:500;">(${m[1]})</span></div>`
      ).join('');
    }
    list.classList.add('open');
  }

  function close() {
    list.classList.remove('open');
  }

  function select(m) {
    input.value = `${m[0]} (${m[1]})`;
    if (hiddenLabel) hiddenLabel.value = `${m[0]} (${m[1]})`;
    close();
    if (onSelect) onSelect(m);
  }

  input.addEventListener('input', () => {
    if (onSelect) onSelect(null); // invalida selezione precedente finché non sceglie di nuovo
    if (hiddenLabel) hiddenLabel.value = '';
    const q = normalizza(input.value.trim());
    if (q.length < 2) { close(); return; }
    const matches = COMUNI_DATA.filter(c => normalizza(c[0]).startsWith(q)).slice(0, 8);
    if (matches.length === 0) {
      const contains = COMUNI_DATA.filter(c => normalizza(c[0]).includes(q)).slice(0, 8);
      render(contains);
    } else {
      render(matches);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (!list.classList.contains('open')) return;
    const items = list.querySelectorAll('.ac-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && currentMatches[activeIndex]) select(currentMatches[activeIndex]);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.ac-item');
    if (!item) return;
    const i = parseInt(item.dataset.i, 10);
    if (currentMatches[i]) select(currentMatches[i]);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) close();
  });
}

let selectedNascita = null; // [nome, sigla, codiceCatastale]

setupAutocomplete('luogoNascita', 'acListNascita', 'luogoNascitaLabel', (m) => {
  selectedNascita = m;
  document.getElementById('luogoNascitaCode').value = m ? m[2] : '';
  ricalcolaCF();
});

setupAutocomplete('comuneResidenza', 'acListResidenza', 'comuneResidenzaLabel', (m) => {
  if (m) {
    document.getElementById('provincia').value = m[1];
    document.querySelector('[data-field="provincia"]').classList.remove('invalid');
  }
});

/* ============================================================
   CALCOLO CODICE FISCALE (algoritmo standard Agenzia Entrate)
   ============================================================ */
const MESI_CF = ['A','B','C','D','E','H','L','M','P','R','S','T'];

function estraiConsonantiVocali(str) {
  const pulito = str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z]/g, '');
  const vocali = 'AEIOU';
  let cons = '', vow = '';
  for (const c of pulito) {
    if (vocali.includes(c)) vow += c; else cons += c;
  }
  return { cons, vow };
}

function codiceCognome(cognome) {
  const { cons, vow } = estraiConsonantiVocali(cognome);
  return (cons + vow + 'XXX').substring(0, 3);
}

function codiceNome(nome) {
  const { cons, vow } = estraiConsonantiVocali(nome);
  if (cons.length >= 4) {
    return cons[0] + cons[2] + cons[3];
  }
  return (cons + vow + 'XXX').substring(0, 3);
}

function carattereControllo(codice15) {
  const dispari = {
    '0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,
    'A':1,'B':0,'C':5,'D':7,'E':9,'F':13,'G':15,'H':17,'I':19,'J':21,
    'K':2,'L':4,'M':18,'N':20,'O':11,'P':3,'Q':6,'R':8,'S':12,'T':14,
    'U':16,'V':10,'W':22,'X':25,'Y':24,'Z':23
  };
  const pari = {
    '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
    'A':0,'B':1,'C':2,'D':3,'E':4,'F':5,'G':6,'H':7,'I':8,'J':9,
    'K':10,'L':11,'M':12,'N':13,'O':14,'P':15,'Q':16,'R':17,'S':18,'T':19,
    'U':20,'V':21,'W':22,'X':23,'Y':24,'Z':25
  };
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = codice15[i];
    sum += (i % 2 === 0) ? dispari[c] : pari[c];
  }
  return String.fromCharCode(65 + (sum % 26));
}

function calcolaCodiceFiscale({ cognome, nome, sesso, giorno, mese, anno, codiceCatastale }) {
  if (!cognome || !nome || !sesso || !giorno || !mese || !anno || !codiceCatastale) return null;
  const c1 = codiceCognome(cognome);
  const c2 = codiceNome(nome);
  const c3 = String(anno).slice(-2).padStart(2, '0');
  const c4 = MESI_CF[mese - 1];
  const giornoConSesso = sesso === 'F' ? giorno + 40 : giorno;
  const c5 = String(giornoConSesso).padStart(2, '0');
  const c6 = codiceCatastale.toUpperCase();
  const codice15 = c1 + c2 + c3 + c4 + c5 + c6;
  const controllo = carattereControllo(codice15);
  return codice15 + controllo;
}

function ricalcolaCF() {
  const manualToggle = document.getElementById('cfManualToggle');
  if (manualToggle.checked) return;

  const nome = document.getElementById('nome').value.trim();
  const cognome = document.getElementById('cognome').value.trim();
  const sesso = document.getElementById('sesso').value;
  const dataNascita = document.getElementById('dataNascita').value; // yyyy-mm-dd
  const cfBox = document.getElementById('codiceFiscale');
  const hint = document.getElementById('cfHint');

  if (!nome || !cognome || !sesso || !dataNascita || !selectedNascita) {
    cfBox.value = '';
    cfBox.classList.remove('ready');
    hint.textContent = 'Si genera da solo quando completi i dati sopra';
    return;
  }

  const [anno, mese, giorno] = dataNascita.split('-').map(Number);
  const cf = calcolaCodiceFiscale({
    cognome, nome, sesso, giorno, mese, anno,
    codiceCatastale: selectedNascita[2]
  });

  if (cf) {
    cfBox.value = cf;
    cfBox.classList.add('ready');
    hint.textContent = 'Calcolato in automatico dai dati inseriti';
    document.querySelector('[data-field="codiceFiscale"]').classList.remove('invalid');
  }
}

['nome', 'cognome', 'sesso', 'dataNascita'].forEach(id => {
  document.getElementById(id).addEventListener('input', ricalcolaCF);
  document.getElementById(id).addEventListener('change', ricalcolaCF);
});

document.getElementById('cfManualToggle').addEventListener('change', (e) => {
  const cfBox = document.getElementById('codiceFiscale');
  if (e.target.checked) {
    cfBox.removeAttribute('readonly');
    cfBox.value = '';
    cfBox.classList.remove('ready');
    document.getElementById('cfHint').textContent = 'Inserisci il tuo codice fiscale';
    cfBox.focus();
  } else {
    cfBox.setAttribute('readonly', 'readonly');
    ricalcolaCF();
  }
});

/* ============================================================
   VALIDAZIONE E INVIO
   ============================================================ */
function setFieldValid(fieldEl, valid) {
  fieldEl.classList.toggle('invalid', !valid);
}

document.getElementById('bookingForm').addEventListener('input', (e) => {
  const field = e.target.closest('[data-field]');
  if (field) field.classList.remove('invalid');
});
document.getElementById('bookingForm').addEventListener('change', (e) => {
  const field = e.target.closest('[data-field]');
  if (field) field.classList.remove('invalid');
});

function validateForm() {
  let allValid = true;
  const check = (id, condition) => {
    const el = document.querySelector(`[data-field="${id}"]`);
    const ok = condition;
    setFieldValid(el, ok);
    if (!ok) allValid = false;
    return ok;
  };

  const ws21 = document.getElementById('ws21').checked;
  const ws22 = document.getElementById('ws22').checked;
  const picker = document.getElementById('workshopPicker');
  if (!ws21 && !ws22) {
    allValid = false;
    picker.classList.add('invalid');
    document.getElementById('wsErr').classList.add('show');
  } else {
    picker.classList.remove('invalid');
    document.getElementById('wsErr').classList.remove('show');
  }

  check('nome', document.getElementById('nome').value.trim().length > 0);
  check('cognome', document.getElementById('cognome').value.trim().length > 0);
  check('telefono', /^[0-9+\s]{8,15}$/.test(document.getElementById('telefono').value.trim()));
  check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(document.getElementById('email').value.trim()));
  check('dataNascita', !!document.getElementById('dataNascita').value);
  check('sesso', !!document.getElementById('sesso').value);
  check('luogoNascita', !!selectedNascita || !!document.getElementById('luogoNascitaCode').value);

  const cfManual = document.getElementById('cfManualToggle').checked;
  const cfVal = document.getElementById('codiceFiscale').value.trim().toUpperCase();
  check('codiceFiscale', cfManual ? cfVal.length === 16 : cfVal.length === 16);

  check('indirizzo', document.getElementById('indirizzo').value.trim().length > 0);
  check('comuneResidenza', document.getElementById('comuneResidenzaLabel').value.trim().length > 0);
  check('provincia', /^[A-Za-z]{2}$/.test(document.getElementById('provincia').value.trim()));
  check('cap', /^[0-9]{5}$/.test(document.getElementById('cap').value.trim()));

  const privacyOk = document.getElementById('privacy').checked;
  if (!privacyOk) allValid = false;

  return allValid;
}

function jsonpSubmit(data) {
  return new Promise((resolve, reject) => {
    const callbackName = 'cbCapocanale_' + Date.now();
    const script = document.createElement('script');
    const params = new URLSearchParams({ ...data, action: 'submit', callback: callbackName });

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, 15000);

    window[callbackName] = (response) => {
      clearTimeout(timeout);
      cleanup();
      resolve(response);
    };

    script.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error('network'));
    };

    script.src = `${ENDPOINT_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('formMsg');
  msg.classList.remove('show', 'ok', 'error');

  if (!validateForm()) {
    msg.textContent = 'Controlla i campi evidenziati in rosso.';
    msg.classList.add('show', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Invio in corso...';

  const payload = {
    ws21: document.getElementById('ws21').checked ? 'si' : 'no',
    ws22: document.getElementById('ws22').checked ? 'si' : 'no',
    totale: aggiornaTotale(),
    nome: document.getElementById('nome').value.trim(),
    cognome: document.getElementById('cognome').value.trim(),
    telefono: document.getElementById('telefono').value.trim(),
    email: document.getElementById('email').value.trim(),
    dataNascita: document.getElementById('dataNascita').value,
    sesso: document.getElementById('sesso').value,
    luogoNascita: document.getElementById('luogoNascitaLabel').value,
    codiceFiscale: document.getElementById('codiceFiscale').value.trim().toUpperCase(),
    indirizzo: document.getElementById('indirizzo').value.trim(),
    comuneResidenza: document.getElementById('comuneResidenzaLabel').value.trim(),
    provincia: document.getElementById('provincia').value.trim().toUpperCase(),
    cap: document.getElementById('cap').value.trim()
  };

  try {
    const result = await jsonpSubmit(payload);
    if (result && result.status === 'ok') {
      const giorni = [];
      if (payload.ws21 === 'si') giorni.push('21 luglio (personalizzazione infradito)');
      if (payload.ws22 === 'si') giorni.push('22 luglio (cocker e cavigliere)');
      let dettaglio = `Ti aspettiamo il ${giorni.join(' e il ')} al Lido La Stiva. Totale da saldare sul posto: €${payload.totale}.`;
      if (payload.ws21 === 'si') {
        dettaglio += ' Ricorda di portare le tue infradito da casa per la personalizzazione.';
      }
      document.getElementById('successDetail').textContent = dettaglio;
      document.getElementById('formState').style.display = 'none';
      document.getElementById('successState').classList.add('show');
    } else {
      throw new Error(result && result.message ? result.message : 'Errore sconosciuto');
    }
  } catch (err) {
    msg.textContent = 'Non siamo riusciti a inviare la prenotazione. Riprova tra poco.';
    msg.classList.add('show', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Prenota il tuo posto';
  }
});
