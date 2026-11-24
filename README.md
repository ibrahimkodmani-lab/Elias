# Elias – Familien-Erinnerungen

Eine private, mobile-first Erinnerungs-App für Elias' erste zwei Lebensjahre. Familienmitglieder können Meilensteine dokumentieren, eigene Ereignisse ergänzen und Fotos/Videos hochladen.

## Stack
- React + TypeScript + Vite
- Supabase Auth, Postgres und privater Storage
- Cloudflare Pages (Vite build)

## Lokal starten
1. `npm install`
2. `.env.example` nach `.env.local` kopieren und Supabase URL sowie Anon Key eintragen.
3. SQL aus `supabase/migrations/202611240001_initial.sql` im Supabase SQL Editor ausführen.
4. `npm run dev`

## Supabase
- E-Mail-Magic-Link-Anmeldung aktivieren.
- Die Migration erstellt Tabellen, RLS-Policies, die RPC-Funktion zum Familienbeitritt per Einladungscode und den privaten Storage-Bucket `elias-media`.
- Für E-Mail-Links die lokale und produktive URL in Supabase Auth > URL Configuration eintragen.

## Cloudflare Pages
- GitHub-Repository mit Cloudflare Pages verbinden.
- Framework preset: Vite; Build command: `npm run build`; Output directory: `dist`.
- Environment Variables setzen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Keine Service-Role-Keys im Frontend hinterlegen.

## Nutzung
Die erste angemeldete Person erstellt eine Familiengruppe und teilt den Einladungscode. Weitere Angehörige melden sich per E-Mail-Link an und treten mit diesem Code bei. Ereignisse und Medien sind nur für Mitglieder derselben Familie sichtbar.

## Datenschutz-Hinweis
Fotos und Videos eines Kindes sind besonders schützenswerte persönliche Daten. Einladungscodes nur privat teilen, Zugriffe regelmäßig prüfen und keine öffentlichen Storage-URLs verwenden. Vor echtem Einsatz Supabase Auth, E-Mail-Zustellung, Backup und Datenschutzinformationen prüfen.
