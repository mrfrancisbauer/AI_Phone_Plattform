# Phase 2 — Realtime-Voice: Konkreter Umsetzungsplan

Ziel: Aus dem rundenbasierten IVR-Gefühl wird ein natürliches Gespräch —
niedrige Latenz, Barge-in (Anrufer darf unterbrechen), LLM-geführter Dialog —
ohne das Herzstück der Plattform (Mandantenfähigkeit, DSGVO, Kostenmodell,
Fragebogen-Datenmodell) anzufassen.

> Preise in diesem Dokument sind Richtwerte (Stand Anfang 2026) und vor
> Vertragsabschluss zu verifizieren.

---

## 1. Ziele & Erfolgskriterien

| KPI | Heute (turn-based) | Ziel Phase 2 |
|---|---|---|
| Antwortlatenz (Ende Anrufer-Satz → KI spricht) | ~2–4 s | **< 1 s p50, < 1,5 s p95** |
| Barge-in (Anrufer unterbricht KI) | ✗ | ✓ |
| Natürliche Formulierung (LLM statt Skript) | ✗ | ✓ |
| Variable Kosten pro Gesprächsminute (roh) | ~€0,03 | **≤ €0,15** |
| Fallback bei Ausfall | — | automatisch zurück auf turn-based |
| Bestehende Pipeline (Summary, E-Mail, Kalender, Kosten, DSGVO) | ✓ | **unverändert** |

---

## 2. Architektur-Entscheidung

### Verglichene Optionen

| | A) Twilio ConversationRelay + LLM (Text) | B) Media Streams + kaskadiert (Deepgram/GPT-4o-mini/Cartesia via Pipecat) | C) OpenAI Realtime (Speech-to-Speech) | D) Managed (Vapi/Retell) |
|---|---|---|---|---|
| Was wir bauen | **Nur den Dialog-Agenten** (Text-WebSocket) | Eigener Audio-Media-Server + STT/TTS-Orchestrierung | Audio-Bridge Twilio↔OpenAI | Nur Prompt + Tool-Endpoints |
| Latenz | ~0,8–1,2 s | ~0,6–1,0 s | ~0,3–0,8 s (beste) | ~0,7–1,2 s |
| Barge-in | ✓ von Twilio gehandhabt | selbst bauen (Pipecat hilft) | ✓ | ✓ |
| Kosten/min (roh, grob) | ~€0,08–0,12 | ~€0,04–0,08 | ~€0,10–0,30 (mini: ~€0,05–0,10) | ~€0,08–0,20 |
| Aufwand | **~2–3 Wochen** | ~4–6 Wochen | ~2–3 Wochen | ~1 Woche |
| Kontrolle / Lock-in | hoch / Twilio-gebunden | **maximal / portabel** | mittel / OpenAI-gebunden | gering / hoch |
| Passt zum Port-Muster | ✓ (TwiML-App bleibt) | ✓✓ | teils | ✗ |

### Empfehlung: **Option A** als Phase 2, Option B als spätere Phase 3-Öffnung

**Twilio ConversationRelay** ist der mit Abstand kleinste Schritt von unserer
heutigen Architektur: Wir bleiben eine TwiML-Anwendung. Twilio übernimmt
Streaming-STT, Streaming-TTS (inkl. Google/Amazon/ElevenLabs-Stimmen — unser
Persona-Mapping aus Phase 1 bleibt nutzbar) **und Barge-in**. Unser Server
bekommt über einen WebSocket **Text** (keine Audio-Frames!) und antwortet mit
Text — d. h. wir bauen nur das, was uns wirklich differenziert: den
**LLM-Dialog-Agenten mit Tools**.

Warum nicht direkt B (billiger, portabler)? Ein eigener Audio-Media-Server
(Jitter, VAD, Barge-in, Codecs, Skalierung) ist die teuerste Baustelle mit dem
geringsten Produkt-Differenzierungswert. Der Dialog-Agent aus Option A ist
**1:1 wiederverwendbar**, wenn wir später auf B (oder Telnyx) wechseln — genau
dafür schneiden wir ihn als eigenen Port (`DialogueAgent`).

Warum nicht C? Bestes Latenzgefühl, aber teuerste Variante, am wenigsten
steuerbar (Konsens-Pflicht! keine erfundenen Aussagen!) und Audio-in/out liegt
vollständig bei OpenAI — DSGVO-seitig am schwersten zu argumentieren.
`gpt-4o-mini-realtime` als Budget-S2S bleibt eine Option, wenn A zu langsam wirkt.

Warum nicht D? Schnellster Demo-Effekt, aber Kern-IP (Gesprächsführung,
Kosten, Datenhaltung) wandert zum Anbieter; Multi-Tenant-Abrechnung und
DSGVO-Kontrolle werden schwieriger. Als Benchmark testen: ja. Als Fundament: nein.

---

## 3. Zielarchitektur (Option A)

```
Anruf ─► Twilio ─► POST /webhooks/twilio/voice
                     │  (tenant.realtimeEnabled?)
        ┌────────────┴─────────────┐
        ▼ nein (heute)             ▼ ja (Phase 2)
   <Gather>/<Say>-Loop        <Connect><ConversationRelay
   (bleibt als Fallback)        url="wss://api…/realtime/{callId}"
                                voice="…persona…" language="de-DE" />
                                   │  Text-Events (Prompt/Interrupt) über WS
                                   ▼
                            Realtime-Session (apps/api/src/realtime/)
                            ├─ session.ts   Call-Kontext, Zustands-Guards
                            ├─ agent.ts     LLM-Loop (streaming, Tool-Calls)
                            └─ tools.ts     save_answer, check_calendar,
                                            book_appointment, end_call, handoff
                                   │ persistiert CallMessage/CallAnswer wie heute
                                   ▼
                        finalizeCall()  ← UNVERÄNDERT
                        (Summary, Lead-Scoring, E-Mails, Kalender, Kosten)
```

**Der architektonische Schlüssel:** `finalizeCall` arbeitet ausschließlich auf
`CallMessage`- und `CallAnswer`-Zeilen. Der Realtime-Agent schreibt dieselben
Zeilen (über Tools, nie freitext-direkt) — dadurch bleiben Zusammenfassung,
Lead-Scoring, E-Mail-Versand, Kalenderbuchung (fail-closed Free/Busy!),
Kostenerfassung und DSGVO-Löschung **komplett unverändert**.

---

## 4. Der Dialog-Agent (das neue Herzstück)

### LLM & Prompting
- Modell: `gpt-4o-mini` (Text, streaming) — Kosten pro Gespräch < €0,01.
  Konfigurierbar über bestehende `LLM_MODEL`-Config.
- System-Prompt wird **pro Anruf gebaut** aus: Assistent-Persona +
  `systemPrompt` des Tenants + Fragebogen (als Ziel-Schema) + harten Regeln
  (Du-darfst-nicht-Liste, `UNCERTAIN_RESPONSE_DE` als Pflicht-Fallback).

### Tools (Function-Calls) — die einzige Schreib-Schnittstelle
| Tool | Wirkung | Guard |
|---|---|---|
| `save_answer(key, value)` | upsert `CallAnswer` | Zod gegen Fragetyp validiert (bestehende `normalizeAnswer`-Regeln als Validator) |
| `check_calendar(datetime_text)` | NL-Parsing (`parseNaturalDateTime`) + `checkAvailability` | bestehende Free/Busy-Logik, schlägt Alternativen vor |
| `book_appointment(iso)` | nur Vormerkung im Call-State | echte Buchung erst in `finalizeCall` (fail-closed, wie heute) |
| `end_call(reason)` | Gespräch beenden → finalize | — |
| `handoff()` | (später) Weiterleitung an Mensch | Feature-Flag |

### Nicht verhandelbare Guards (außerhalb des LLM erzwungen)
1. **Konsens-Gate:** Solange `consentGiven=false`, ist der Agent auf die
   Konsens-Frage beschränkt (State-Machine um das LLM herum, kein Prompt-Trick).
   „Nein" → höflicher Abschied, Status `declined` — exakt wie heute.
2. **Prompt-Injection:** Anrufer-Text ist untrusted. Schreibzugriffe laufen nur
   über Zod-validierte Tools; es gibt kein Tool für E-Mail, Preise oder Daten
   anderer Mandanten.
3. **Budget-Caps:** max. Gesprächsdauer (konfig., Default 10 min), max. Tokens
   pro Call; bei Überschreitung sauberer Abschluss statt Abbruch.
4. **Ausfall-Fallback:** WS-Fehler/LLM-Timeout → TwiML-Redirect zurück in den
   heutigen `<Gather>`-Flow desselben Calls (Zustand liegt in der DB).

---

## 5. Konkrete Code-Änderungen

| # | Änderung | Dateien |
|---|---|---|
| 1 | Migration 0008: `realtimeEnabled Boolean @default(false)` auf `Tenant` | `schema.prisma`, Migration |
| 2 | Config: `REALTIME_ENABLED` (global), `REALTIME_MAX_MINUTES`, `REALTIME_STT_PRICE_PER_MINUTE`, `REALTIME_TTS_PRICE_PER_MINUTE` | `config.ts`, `.env.example` |
| 3 | Webhook-Verzweigung: realtime → `<Connect><ConversationRelay …>` mit Persona-Voice (Mapping aus Phase 1 wiederverwenden), sonst heutiger Flow | `routes/webhooks.ts`, `lib/twilio.ts` (neuer Builder `twimlConversationRelay`) |
| 4 | Neues Modul `apps/api/src/realtime/`: WS-Route (`@fastify/websocket`, **einzige neue Dependency**), Signatur-/Token-Prüfung des WS-Handshakes, Session, Agent, Tools | neu |
| 5 | Agent-Loop: OpenAI Chat Completions **streaming** + Tool-Calls; Sätze satzweise an ConversationRelay senden (geringere gefühlte Latenz); Interrupt-Event → Generierung abbrechen | `realtime/agent.ts` |
| 6 | Persistenz: jede Äußerung → `CallMessage` (verschlüsselt, wie heute); `save_answer` → `CallAnswer`; `end_call` → `finalizeCall` | `realtime/tools.ts` |
| 7 | Kosten: `recordUsage` bekommt echte Token-Zahlen des Dialogs (statt Schätzung); STT/TTS-Minutenpreise für den Realtime-Pfad aus neuen Config-Werten | `cost.service.ts` |
| 8 | Admin/UI: Tenant-Toggle „Realtime-Gespräche (Beta)" im Super-Admin; Badge auf der Testanruf-Seite | Admin-UI, `admin.ts` |
| 9 | Tests: Agent-Loop mit gemocktem LLM (Tool-Call-Sequenzen), Konsens-Gate, Tool-Validierungen (Zod), Fallback-TwiML | neu, CI-fähig ohne externe Calls |

**Wichtig:** Der Dialog-Agent wird gegen ein schmales Interface geschrieben
(`DialogueTransport`: `sendText`, `onUserText`, `onInterrupt`, `hangup`) — die
ConversationRelay-Anbindung ist nur ein Adapter. Ein späterer Wechsel auf
Media Streams/Pipecat (Phase 3) oder Telnyx tauscht den Adapter, nicht den Agenten.

---

## 6. Meilensteine & Aufwand

| MS | Inhalt | Aufwand | Abnahme |
|---|---|---|---|
| **M0** | Spike: ConversationRelay-Echo-Server, Latenz real messen, Voice-Namen (Persona-Mapping) verifizieren | 1–2 Tage | Testanruf: KI „plappert nach", Latenz < 1 s, Barge-in wirkt |
| **M1** | WS-Infrastruktur: Route, Handshake-Auth (signiertes Call-Token in der WS-URL), Session-Lifecycle, Fallback-Redirect | 2–3 Tage | Absichtlicher WS-Kill → Call läuft turn-based weiter |
| **M2** | Dialog-Agent: System-Prompt-Builder, Streaming-Loop, Tools `save_answer`/`end_call`, Konsens-Gate, Persistenz | 3–5 Tage | Kompletter Fragebogen-Durchlauf per Telefon; `finalizeCall` liefert Summary + E-Mail wie heute |
| **M3** | Kalender-Tools: `check_calendar` (NL + Free/Busy + Alternativen), Vormerkung → fail-closed Buchung | 1–2 Tage | Belegter Slot → Alternative wird gesprochen; keine Doppelbuchung |
| **M4** | Kosten (echte Tokens + Realtime-Raten), Budget-Caps, Admin-Toggle, Beta-Badge | 1–2 Tage | UsageEvent stimmt mit Provider-Dashboards überein |
| **M5** | Härtung & Rollout: Lasttest (10 parallele Calls), Prompt-Red-Teaming, Docs, Demo-Tenant aktivieren | 2–3 Tage | Go/No-Go-Checkliste grün |

**Summe: ~10–17 Arbeitstage.** Jeder Meilenstein ist einzeln mergefähig
(Feature-Flag aus = Null-Risiko für Bestandskunden).

---

## 7. Kostenmodell pro Gesprächsminute (Option A, Richtwerte)

| Posten | €/min |
|---|---|
| Twilio Inbound (DE) | ~0,008 |
| ConversationRelay (STT+TTS+Orchestrierung, gebündelt) | ~0,05–0,09 |
| LLM gpt-4o-mini (~1,5k Tokens/min) | ~0,001 |
| **Roh gesamt** | **~0,06–0,10** |
| + 30 % Platform-Markup (bestehend) | ~0,08–0,13 |

Zum Vergleich: heutiger Pfad ~€0,03 roh. Der Realtime-Aufpreis (~+€0,05/min)
ist das Produkt-Upgrade — bei 500 min/Monat ≈ +€25 Rohkosten pro Kunde;
preislich über die Pläne (Starter ohne / Business+Enterprise mit Realtime)
oder einen Minutenpreis abbildbar. ElevenLabs-Stimmen über ConversationRelay
kosten mehr (~+0,03–0,06/min) — als Premium-Option je Plan denkbar.

---

## 8. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Latenz enttäuscht trotz Streaming | M0 misst zuerst; Hebel: satzweises TTS-Feeding, kürzere Prompts, `gpt-4o-mini`; Eskalation: `gpt-4o-mini-realtime` (S2S) hinter demselben Agent-Interface |
| LLM erfindet Fakten / verlässt Skriptziel | Tools-only-Writes, `UNCERTAIN_RESPONSE_DE`-Pflichtregel, Red-Teaming in M5, Transkript-Audit wie heute |
| DSGVO: Audio/Text verlässt EU | Twilio Data Residency (EU) für Media/CR prüfen; OpenAI EU-Data-Residency-Projekt nutzen; AVV-Liste ergänzen (Twilio, OpenAI); Transkripte bleiben AES-verschlüsselt bei uns; `recordAudio` bleibt opt-in |
| Kosten-Runaway (lange Calls, Schleifen) | Max-Dauer + Token-Cap pro Call, Budget-Auto-Pause des Tenants greift wie heute |
| Twilio-Lock-in (CR ist proprietär) | Agent hinter `DialogueTransport`-Port; Phase 3 = Media-Streams/Pipecat-Adapter, wenn Volumen die eigene Pipeline rechtfertigt (Break-even grob > 50k min/Monat) |
| WS-Skalierung (persistente Verbindungen) | Sessions sind DB-gestützt (stateless Prozesse), horizontal skalierbar; Lasttest in M5 |

---

## 9. Rollout-Strategie

1. **Flag aus für alle** → mergen ohne Kundenwirkung.
2. **Demo-Tenant** aktivieren → interne Testanrufe (Testcall-Seite zeigt „Realtime Beta").
3. **Schattenphase:** 1–2 freundliche Pilotkunden, tägliche Transkript-Reviews.
4. **GA je Plan** (Business+), turn-based bleibt dauerhaft als Fallback und für Preissensible.

## 10. Bewusst NICHT in Phase 2

- Eigener Audio-Stack (Media Streams/Pipecat) → Phase 3, kostengetrieben.
- Outbound-Calls, Live-Handoff an Menschen, Voicemail-Erkennung.
- Mehrsprachigkeit über DE/EN hinaus.
- Eigenes Voice-Cloning / Custom-Stimmen.
