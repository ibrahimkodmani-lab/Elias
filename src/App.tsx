import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { Baby, CalendarDays, Camera, Check, ChevronDown, CirclePlus, Heart, ImagePlus, LogOut, Mail, Plus, Send, Sparkles, Upload, Users, Video, X } from "lucide-react";

type Family = { id: string; name: string; invite_code: string; birth_date: string | null };
type EventItem = { id: string; family_id: string; title: string; description: string; happened_on: string; created_by: string };
type MediaItem = { id: string; event_id: string; storage_path: string; original_name: string; media_type: "image" | "video" };
type EventWithMedia = EventItem & { media: (MediaItem & { url?: string })[] };

const milestones = [
  ["Willkommen, Elias!", "Der erste große Moment: Elias ist auf der Welt. Ein neues Kapitel beginnt.", 0],
  ["Das erste Kennenlernen", "Die ersten Stunden und Tage voller Staunen, Kuscheln und kleiner Hände.", 2],
  ["Das erste bewusste Lächeln", "Ein Lächeln, das alle Herzen schmelzen lässt.", 45],
  ["Das erste laute Lachen", "Dieser Klang, den die Familie immer wieder hören möchte.", 90],
  ["Elias entdeckt seine Hände", "Staunen, greifen und die Welt mit allen Sinnen entdecken.", 120],
  ["Das erste Mal drehen", "Ein kleiner Dreh – ein riesiger Entwicklungsschritt.", 150],
  ["Ganz alleine sitzen", "Elias wird immer neugieriger und beobachtet die Welt aufrecht.", 210],
  ["Der erste Zahn", "Ein winziger Zahn zeigt sich – was für ein Meilenstein!", 210],
  ["Das erste Krabbeln", "Auf geht's! Elias erkundet jetzt die Welt auf eigene Faust.", 270],
  ["Hochziehen und stehen", "Die Welt aus einer ganz neuen Perspektive sehen.", 300],
  ["Die ersten Schritte", "Ein Moment, den niemand in der Familie vergessen wird.", 365],
  ["Das erste Wort", "Mama, Papa oder etwas ganz Eigenes – Elias beginnt zu erzählen.", 390],
  ["Der erste Geburtstag", "Ein ganzes Jahr voller Liebe, Lernen und unvergesslicher Momente.", 365],
  ["Elias wird zum kleinen Entdecker", "Neue Lieblingsspiele, eigene Ideen und jeden Tag etwas Neues.", 450],
  ["Der zweite Geburtstag", "Zwei Jahre Elias. Und unendlich viele Geschichten, die bleiben.", 730]
] as const;

const dateLabel = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
const daysBetween = (a: string, b: string) => Math.max(0, Math.floor((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000));
const ageLabel = (birth: string | null, date: string) => {
  if (!birth) return "Erinnerung";
  const days = daysBetween(birth, date);
  if (days === 0) return "Geburtstag";
  if (days < 30) return days + (days === 1 ? " Tag" : " Tage");
  const months = Math.floor(days / 30.4375);
  if (months < 24) return months + (months === 1 ? " Monat" : " Monate");
  return "2 Jahre";
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [family, setFamily] = useState<Family | null>(null);
  const [events, setEvents] = useState<EventWithMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [familyName, setFamilyName] = useState("Familie von Elias");
  const [birthDate, setBirthDate] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [happenedOn, setHappenedOn] = useState(new Date().toISOString().slice(0, 10));
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "photos">("all");

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 2100);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { window.clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session) loadFamily();
    else { setFamily(null); setEvents([]); }
  }, [session]);

  async function loadFamily() {
    setLoading(true); setError("");
    const { data: memberships, error: memberError } = await supabase.from("family_members").select("family_id").limit(1);
    if (memberError) { setError(memberError.message); setLoading(false); return; }
    if (!memberships?.length) { setFamily(null); setEvents([]); setLoading(false); return; }
    const { data: fam, error: famError } = await supabase.from("families").select("*").eq("id", memberships[0].family_id).single();
    if (famError) { setError(famError.message); setLoading(false); return; }
    setFamily(fam);
    const { data: rows, error: eventError } = await supabase.from("events").select("*").eq("family_id", fam.id).order("happened_on", { ascending: true });
    if (eventError) { setError(eventError.message); setLoading(false); return; }
    const eventIds = (rows || []).map((e: EventItem) => e.id);
    let media: MediaItem[] = [];
    if (eventIds.length) {
      const { data } = await supabase.from("event_media").select("*").in("event_id", eventIds);
      media = data || [];
    }
    const enriched = await Promise.all((rows || []).map(async (event: EventItem) => {
      const attachments = await Promise.all(media.filter(m => m.event_id === event.id).map(async m => {
        const { data } = await supabase.storage.from("elias-media").createSignedUrl(m.storage_path, 3600);
        return { ...m, url: data?.signedUrl };
      }));
      return { ...event, media: attachments };
    }));
    setEvents(enriched); setLoading(false);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!email.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    if (error) setError(error.message); else setAuthSent(true);
  }

  async function createFamily(e: React.FormEvent) {
    e.preventDefault(); if (!session || !birthDate) return;
    setError(""); setLoading(true);
    const { data: fam, error: createError } = await supabase.from("families").insert({ name: familyName.trim(), birth_date: birthDate, created_by: session.user.id }).select().single();
    if (createError) { setError(createError.message); setLoading(false); return; }
    const { error: memberError } = await supabase.from("family_members").insert({ family_id: fam.id, user_id: session.user.id, role: "owner" });
    if (memberError) { setError(memberError.message); setLoading(false); return; }
    const starterEvents = milestones.map(([t, d, offset]) => {
      const date = new Date(birthDate + "T12:00:00"); date.setDate(date.getDate() + offset);
      return { family_id: fam.id, title: t, description: d, happened_on: date.toISOString().slice(0, 10), created_by: session.user.id };
    });
    const { error: seedError } = await supabase.from("events").insert(starterEvents);
    if (seedError) setError("Familie erstellt, aber die Start-Ereignisse konnten nicht angelegt werden: " + seedError.message);
    await loadFamily();
  }

  async function joinFamily(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    const { error } = await supabase.rpc("join_family_by_code", { code: inviteCode });
    if (error) { setError(error.message); setLoading(false); return; }
    setShowJoin(false); await loadFamily();
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault(); if (!family || !session || !title.trim()) return;
    const { error } = await supabase.from("events").insert({ family_id: family.id, title: title.trim(), description: description.trim(), happened_on: happenedOn, created_by: session.user.id });
    if (error) setError(error.message);
    else { setShowAdd(false); setTitle(""); setDescription(""); await loadFamily(); }
  }

  async function uploadFiles(eventId: string, files: FileList | null) {
    if (!family || !session || !files?.length) return;
    setUploadingFor(eventId); setError("");
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      if (!file.type.startsWith("image/") && !isVideo) { setError("Bitte nur Bild- oder Videodateien auswählen."); continue; }
      if (file.size > 50 * 1024 * 1024) { setError(file.name + " ist größer als 50 MB."); continue; }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = family.id + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await supabase.storage.from("elias-media").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) { setError(uploadError.message); continue; }
      const { error: metaError } = await supabase.from("event_media").insert({ event_id: eventId, family_id: family.id, storage_path: path, original_name: file.name, media_type: isVideo ? "video" : "image", uploaded_by: session.user.id });
      if (metaError) { await supabase.storage.from("elias-media").remove([path]); setError(metaError.message); }
    }
    setUploadingFor(null); await loadFamily();
  }

  const visibleEvents = useMemo(() => events.filter(e => filter === "all" || e.media.some(m => m.media_type === "image" || m.media_type === "video")), [events, filter]);
  const today = new Date().toISOString().slice(0, 10);

  if (booting) return <div className="splash"><div className="splash-mark"><Heart size={34} fill="currentColor" /></div><div className="splash-name">elias<span>.</span></div><p>Unsere gemeinsame Geschichte</p><div className="loader"><i /></div><small>Ein kleiner Moment voller Wunder</small></div>;

  if (!isSupabaseConfigured) return <main className="setup-screen"><div className="brand"><Heart fill="currentColor" /> elias<span>.</span></div><h1>Fast geschafft!</h1><p>Trage zuerst deine Supabase-Projektdaten ein, damit Elias' Erinnerungen sicher gespeichert werden können.</p><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code><p className="muted">Details findest du in der README im GitHub-Repository.</p></main>;

  if (!session) return <main className="auth-screen"><div className="auth-card"><div className="brand"><Heart fill="currentColor" /> elias<span>.</span></div><div className="eyebrow">EIN ORT FÜR DIE SCHÖNSTEN MOMENTE</div><h1>Eine Kindheit.<br/><em>Unzählige Erinnerungen.</em></h1><p className="muted">Melde dich mit deiner E-Mail-Adresse an. Wir schicken dir einen sicheren Anmeldelink.</p>{authSent ? <div className="success"><Mail size={22}/><b>Schau in dein Postfach!</b><span>Wir haben einen Anmeldelink an {email} geschickt.</span></div> : <form onSubmit={sendMagicLink}><label>E-Mail-Adresse</label><input type="email" placeholder="du@beispiel.de" value={email} onChange={e => setEmail(e.target.value)} required/><button className="primary full"><Send size={17}/> Anmeldelink senden</button></form>}{error && <p className="error">{error}</p>}<div className="privacy-note"><Heart size={15}/> Nur eingeladene Familienmitglieder sehen eure Erinnerungen.</div></div><div className="auth-art"><div className="sun"/><div className="art-copy"><span>ELIAS' ERSTE 2 JAHRE</span><h2>Die kleinen Dinge<br/>werden zu den<br/><i>größten Erinnerungen.</i></h2></div><div className="art-flower">✿</div></div></main>;

  if (!family) return <main className="onboard"><div className="brand"><Heart fill="currentColor" /> elias<span>.</span></div><div className="onboard-card"><div className="round-icon"><Users/></div><div className="eyebrow">WILLKOMMEN IN ELIAS' WELT</div><h1>Gemeinsam Erinnerungen sammeln.</h1><p className="muted">Erstelle eure Familiengruppe oder tritt einer bestehenden mit einem Einladungscode bei.</p><form onSubmit={createFamily}><label>Name eurer Familiengruppe</label><input value={familyName} onChange={e=>setFamilyName(e.target.value)} required/><label>Geburtsdatum von Elias</label><input type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} required/><button className="primary full" disabled={loading}><Sparkles size={17}/> Familienchronik erstellen</button></form><div className="or"><span/> oder <span/></div><button className="secondary full" onClick={()=>setShowJoin(!showJoin)}><Users size={17}/> Mit Einladungscode beitreten <ChevronDown size={16}/></button>{showJoin && <form className="join-form" onSubmit={joinFamily}><label>Einladungscode</label><input value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase())} placeholder="z. B. A1B2C3D4" required/><button className="primary full" disabled={loading}>Familie beitreten</button></form>}{error && <p className="error">{error}</p>}</div><button className="logout" onClick={()=>supabase.auth.signOut()}><LogOut size={15}/> Abmelden</button></main>;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#"><Heart fill="currentColor"/> elias<span>.</span></a><div className="top-actions"><span className="family-pill"><Users size={15}/>{family.name}</span><button className="icon-btn" title="Abmelden" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/></button></div></header>
    <main className="main-content">
      <section className="hero"><div className="hero-text"><div className="eyebrow">UNSERE LIEBLINGSZEIT</div><h1>Hallo, Elias<span>!</span></h1><p>Jeder Tag schreibt eine neue kleine Geschichte.</p><div className="hero-meta"><span><CalendarDays size={15}/> {family.birth_date ? "Geboren am " + dateLabel(family.birth_date) : "Eure Familienchronik"}</span><span><Heart size={15}/> {events.length} Erinnerungen</span></div></div><div className="hero-illustration"><div className="hero-sun"/><div className="hero-cloud">☁</div><div className="hero-heart">♡</div><div className="hero-caption">WACHSEN. STAUNEN. LIEBEN.</div></div></section>
      <section className="toolbar"><div><div className="eyebrow">DIE ZEIT VERGEHT, DIE MOMENTE BLEIBEN</div><h2>Elias' Meilensteine</h2></div><button className="primary add-button" onClick={()=>setShowAdd(true)}><Plus size={18}/> Ereignis hinzufügen</button></section>
      <div className="filters"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Alle Ereignisse</button><button className={filter==="photos"?"active":""} onClick={()=>setFilter("photos")}><Camera size={14}/> Mit Medien</button><span className="filter-count">{visibleEvents.length} MOMENTE</span></div>
      {error && <div className="inline-error">{error}<button onClick={()=>setError("")}><X size={15}/></button></div>}
      {loading ? <div className="loading-state">Die Erinnerungen werden geladen …</div> : <div className="timeline">{visibleEvents.map((ev, index) => {
        const past = ev.happened_on <= today;
        return <article className={"event-row " + (!past ? "future" : "")} key={ev.id}><div className="timeline-rail"><div className={"timeline-dot " + (past ? "done" : "")}>{past ? <Check size={13}/> : <Sparkles size={13}/>}</div>{index !== visibleEvents.length-1 && <div className="timeline-line"/>}</div><div className="event-card"><div className="event-top"><div><span className="event-age">{ageLabel(family.birth_date, ev.happened_on)}</span><h3>{ev.title}</h3></div><time>{dateLabel(ev.happened_on)}</time></div>{ev.description && <p className="event-description">{ev.description}</p>}{ev.media.length>0 && <div className="media-grid">{ev.media.map(m=><a className="media-thumb" key={m.id} href={m.url} target="_blank" rel="noreferrer">{m.media_type==="video"?<><video src={m.url} muted/><span className="play"><Video size={16}/></span></>:<img src={m.url} alt={m.original_name}/>}</a>)}</div>}<div className="event-footer"><span>{ev.media.length ? <><Camera size={14}/>{ev.media.length} {ev.media.length===1?"Erinnerung":"Erinnerungen"}</> : <><Heart size={14}/> Ein Moment für immer</>}</span><label className="upload-link"><input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onChange={e=>{uploadFiles(ev.id,e.target.files);e.currentTarget.value="";}}/><ImagePlus size={16}/>{uploadingFor===ev.id?"Wird hochgeladen …":"Foto / Video hinzufügen"}</label></div></div></article>;
      })}{visibleEvents.length===0 && <div className="empty-state"><div className="round-icon"><Camera/></div><h3>Noch keine Medienmomente</h3><p>Füge Fotos oder Videos zu einem Ereignis hinzu – hier erscheinen sie gesammelt.</p></div>}</div>}
      <footer className="app-footer"><Heart size={14} fill="currentColor"/> Mit ganz viel Liebe für Elias gemacht <span>·</span><button onClick={()=>{navigator.clipboard?.writeText(family.invite_code);}}>Einladungscode: {family.invite_code}</button></footer>
    </main>
    {showAdd && <div className="modal-backdrop" onClick={()=>setShowAdd(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">EIN NEUER MOMENT</div><h2>Erinnerung festhalten</h2></div><button className="icon-btn" onClick={()=>setShowAdd(false)}><X/></button></div><form onSubmit={addEvent}><label>Titel des Ereignisses</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="z. B. Elias besucht zum ersten Mal den Zoo" required maxLength={120}/><label>Wann ist es passiert?</label><input type="date" value={happenedOn} onChange={e=>setHappenedOn(e.target.value)} required/><label>Erzählt die Geschichte dazu</label><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Was ist passiert? Wer war dabei? Was war besonders?" rows={4}/><button className="primary full"><CirclePlus size={17}/> Ereignis speichern</button></form></div></div>}
  </div>;
}
