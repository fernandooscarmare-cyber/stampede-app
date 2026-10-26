import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import Papa from "papaparse";
import {
  Dumbbell, CalendarDays, Timer as TimerIcon, Settings as SettingsIcon,
  LogOut, Plus, X, Check, TrendingUp, ChevronLeft, ChevronRight, User,
  Eye, EyeOff, Trash2, Flame, ClipboardList, KeyRound,
  Zap, CheckCircle2, Clock, Repeat, Users, Link2, Unlink2, ArrowUpRight, Pencil, Upload, BarChart3,
  Download, ShieldCheck, AlertTriangle, Percent, Trophy,
} from "lucide-react";
import * as db from "./db";
import { supabase } from "./supabaseClient";
import { HORSES } from "./horses";

/* ========================================================================
   STAMPEDE — app de crossfit conectada a Supabase (auth real, RM, WODs,
   resultados, coach-atleta, cronómetros, estadísticas).
   ======================================================================== */

const STRENGTH_EXERCISES = [
  "Back Squat", "Front Squat", "Overhead Squat", "Deadlift", "Sumo Deadlift",
  "Clean", "Power Clean", "Clean & Jerk", "Snatch", "Power Snatch",
  "Push Press", "Push Jerk", "Strict Press", "Bench Press", "Thruster",
];

const SKILL_EXERCISES = [
  "Bar Muscle-Ups (BMU)", "Ring Muscle-Ups (RMU)",
  "Pull-Ups estrictas", "Pull-Ups kipping", "Chest-to-Bar", "Toes-to-Bar",
  "Handstand Push-Ups estrictas", "Handstand Push-Ups kipping", "Handstand Walk",
  "Double Unders", "Rope Climbs", "Wall Balls sin soltar", "Pistol Squats", "Push-Ups",
];

const DEFAULT_EXERCISES = [...STRENGTH_EXERCISES, ...SKILL_EXERCISES];

const EXERCISE_UNIT_HINTS = { "Handstand Walk": "m" };
function defaultUnitFor(exercise) {
  if (EXERCISE_UNIT_HINTS[exercise]) return EXERCISE_UNIT_HINTS[exercise];
  if (SKILL_EXERCISES.includes(exercise)) return "reps";
  return "kg";
}

// Los coaches siempre usan esta navegación (crean contenido para todas las
// modalidades desde acá, sin importar la modalidad de su propio perfil).
const NAV_CROSSFIT = [
  { id: "wod", label: "WOD", icon: ClipboardList },
  { id: "rm", label: "RM", icon: Dumbbell },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "timer", label: "Timer", icon: TimerIcon },
  { id: "routines", label: "Rutinas", icon: Repeat, coachOnly: true },
  { id: "athletes", label: "Atletas", icon: Users, coachOnly: true },
  { id: "settings", label: "Ajustes", icon: SettingsIcon },
];
// Atletas de GAP / Musculación
const NAV_ROUTINE = [
  { id: "wod", label: "Hoy", icon: ClipboardList },
  { id: "rm", label: "Progreso", icon: TrendingUp },
  { id: "timer", label: "Timer", icon: TimerIcon },
  { id: "settings", label: "Ajustes", icon: SettingsIcon },
];
// Atletas de Hyrox
const NAV_HYROX = [
  { id: "wod", label: "Hoy", icon: ClipboardList },
  { id: "stations", label: "Estaciones", icon: Dumbbell },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "settings", label: "Ajustes", icon: SettingsIcon },
];

const WOD_TYPE_PRESETS = ["For Time", "AMRAP", "EMOM", "OTM", "Tabata", "Fuerza", "Otro"];

const MODALITIES = [
  { id: "crossfit", label: "Crossfit" },
  { id: "gap", label: "GAP" },
  { id: "musculacion", label: "Musculación" },
  { id: "hibrido", label: "Híbrido" },
  { id: "hyrox", label: "Hyrox" },
];
function modalityLabel(id) {
  return MODALITIES.find((m) => m.id === id)?.label || "Crossfit";
}

const ROUTINE_SPLITS = {
  gap: ["Glúteos", "Abdominales", "Piernas", "Full body"],
  musculacion: ["Push", "Pull", "Legs", "Superior", "Inferior", "Full body"],
};
const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const WEEKDAYS_SHORT = ["D", "L", "M", "X", "J", "V", "S"];

// Hyrox: formato fijo de carrera — 8 corridas de 1km alternadas con las 8 estaciones.
const HYROX_SEGMENTS = [
  { name: "Run 1km", type: "run" },
  { name: "SkiErg 1000m", type: "station" },
  { name: "Run 1km", type: "run" },
  { name: "Sled Push 50m", type: "station" },
  { name: "Run 1km", type: "run" },
  { name: "Sled Pull 50m", type: "station" },
  { name: "Run 1km", type: "run" },
  { name: "Burpee Broad Jump 80m", type: "station" },
  { name: "Run 1km", type: "run" },
  { name: "Row 1000m", type: "station" },
  { name: "Run 1km", type: "run" },
  { name: "Farmers Carry 200m", type: "station" },
  { name: "Run 1km", type: "run" },
  { name: "Sandbag Lunges 100m", type: "station" },
  { name: "Run 1km", type: "run" },
  { name: "Wall Balls 100", type: "station" },
];
const HYROX_STATIONS = HYROX_SEGMENTS.filter((s) => s.type === "station").map((s) => s.name);

function fmtRaceClock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

// Frases de atletas de CrossFit (citas textuales traducidas al español).
// Fuente de las citas originales: BoxRox, "29 Inspiring Quotes from Crossfit and Weightlifting Athletes".
const MOTIVATIONAL_QUOTES = [
  { name: "Mat Fraser", quote: "No entrenás para imaginarte en el segundo puesto del podio. El segundo puesto es una porquería." },
  { name: "Rich Froning", quote: "El cuerpo humano es una máquina increíble, pero la mayoría de la gente solo saca de ella lo que su mente le permite." },
  { name: "Rich Froning", quote: "No voy a dejar que nadie trabaje más que yo." },
  { name: "Julie Foucher", quote: "Podés quedarte quejándote y enojado por lo que pasó, pero al final del día no podés cambiar nada." },
  { name: "Julie Foucher", quote: "CrossFit nos obliga a preguntarnos: ¿Quién soy? ¿De qué estoy hecho?" },
  { name: "Camille Leblanc-Bazinet", quote: "Mi consejo es muy simple: si querés algo, matate trabajando por eso." },
  { name: "Camille Leblanc-Bazinet", quote: "Cuando entreno, borro todos los límites y expectativas de lo que puedo hacer. Soy poderosa y todo es posible." },
  { name: "Brooke Ence", quote: "Sí, claro que voy a divertirme, pero voy a subir al podio." },
  { name: "Lauren Fisher", quote: "Nunca le pongas un límite de edad a tus sueños." },
  { name: "Ben Smith", quote: "CrossFit es una forma de vida. Comés bien, entrenás duro, te exigís. Te enseña muchísimo sobre vos mismo." },
  { name: "Mark Smith", quote: "Yo diría que nunca te rindas. Cuando empecé CrossFit todo parecía imposible, pero nunca dejé que ningún movimiento me ganara." },
  { name: "Lindy Barber", quote: "No dejes que el éxito se te suba a la cabeza ni que el fracaso te llegue al corazón." },
  { name: "Stacie Tovar", quote: "Soy una trabajadora incansable. Cien por ciento pura sangre." },
  { name: "Daniel Casey", quote: "Quiero que la gente me mire y vea que no son solo los Froning del mundo los que pueden hacer esto… también la gente común." },
  { name: "Amanda Turner", quote: "Cuando estoy en el box me siento normal, como todos los demás. Y hago los WODs como todos los demás." },
];

function getQuoteOfDay() {
  const key = todayKey();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return MOTIVATIONAL_QUOTES[hash % MOTIVATIONAL_QUOTES.length];
}

function QuoteOfDay() {
  const q = useMemo(() => getQuoteOfDay(), []);
  return (
    <div className="box-card" style={{ marginBottom: 18, borderLeft: "3px solid var(--amber)" }}>
      <div className="box-h3" style={{ marginBottom: 6 }}>Frase del día</div>
      <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: 17, fontStyle: "italic", margin: 0, lineHeight: 1.3 }}>
        "{q.quote}"
      </p>
      <div style={{ marginTop: 8, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 0.5, color: "var(--amber)", textTransform: "uppercase" }}>
        — {q.name}
      </div>
    </div>
  );
}

/* ---------------------------- utilidades ---------------------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseDateFlexible(raw) {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt)) return dt;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt)) return dt;
  }
  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
}

function toKey(dt) {
  if (!dt) return "sin-fecha";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHuman(dt) {
  if (!dt) return "Sin fecha";
  return dt.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
}

function todayKey() {
  return toKey(new Date());
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${pad2(m)}:${pad2(sec)}`;
}

function periodKey(date, granularity) {
  const y = date.getFullYear();
  const m = date.getMonth();
  if (granularity === "month") return `${y}-${String(m + 1).padStart(2, "0")}`;
  if (granularity === "quarter") return `${y}-Q${Math.floor(m / 3) + 1}`;
  if (granularity === "half") return `${y}-H${m < 6 ? 1 : 2}`;
  return `${y}`;
}

function periodLabel(key, granularity) {
  if (granularity === "month") {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" }).replace(".", "");
  }
  if (granularity === "quarter") {
    const [y, q] = key.split("-Q");
    return `T${q} '${y.slice(2)}`;
  }
  if (granularity === "half") {
    const [y, h] = key.split("-H");
    return `S${h} '${y.slice(2)}`;
  }
  return key;
}

function bucketByPeriod(items, granularity, dateFn) {
  const map = {};
  items.forEach((it) => {
    const d = dateFn(it);
    if (!d || isNaN(d)) return;
    const key = periodKey(d, granularity);
    (map[key] = map[key] || []).push(it);
  });
  return Object.keys(map).sort().map((key) => ({ key, label: periodLabel(key, granularity), items: map[key] }));
}

function parseNumericValue(str) {
  if (!str) return null;
  const m = String(str).replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function parseClockSeconds(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function computeStreaks(dateKeys) {
  const set = new Set(dateKeys);
  const sorted = Array.from(set).sort();
  if (sorted.length === 0) return { current: 0, best: 0 };
  let best = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prevDate = new Date(sorted[i - 1] + "T00:00:00");
    const curDate = new Date(sorted[i] + "T00:00:00");
    const diff = Math.round((curDate - prevDate) / 86400000);
    run = diff === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  const lastDate = sorted[sorted.length - 1];
  const today = todayKey();
  const yesterday = toKey(new Date(Date.now() - 86400000));
  let current = 0;
  if (lastDate === today || lastDate === yesterday) {
    current = 1;
    const cursor = new Date(lastDate + "T00:00:00");
    while (true) {
      cursor.setDate(cursor.getDate() - 1);
      if (set.has(toKey(cursor))) current++; else break;
    }
  }
  return { current, best };
}

function weeklyTrend(dateKeys, weeksCount = 8) {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + mondayOffset); thisMonday.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let w = weeksCount - 1; w >= 0; w--) {
    const monday = new Date(thisMonday); monday.setDate(thisMonday.getDate() - w * 7);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    const label = `${monday.getDate()}/${monday.getMonth() + 1}`;
    const count = dateKeys.filter((k) => { const d = new Date(k + "T00:00:00"); return d >= monday && d <= sunday; }).length;
    buckets.push({ label, wods: count });
  }
  return buckets;
}

function downloadCSV(filename, rows, headers) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isInMonth(dateStr, monthDate) {
  if (!dateStr) return false;
  const dt = new Date(dateStr);
  if (isNaN(dt)) return false;
  return dt.getFullYear() === monthDate.getFullYear() && dt.getMonth() === monthDate.getMonth();
}

function formatResultValue(n) {
  const parts = [];
  if (n.time) parts.push(n.time);
  if (n.rounds != null && n.rounds !== "") parts.push(`${n.rounds}${n.reps ? `+${n.reps}` : ""} rondas`);
  if (parts.length) return parts.join(" · ");
  return n.completed ? "Completado" : "—";
}

/* ---------------------------- PRs automáticos ---------------------------- */

// Puntaje comparable de un resultado: tiempo (menor es mejor) o rondas+reps (mayor es mejor).
function resultScore(r) {
  if (!r) return null;
  const t = parseClockSeconds(r.time);
  if (t != null && t > 0) return { kind: "time", v: t };
  if (r.rounds != null && r.rounds !== "") return { kind: "rounds", v: Number(r.rounds) * 1000 + Number(r.reps || 0) };
  return null;
}

function isBetterScore(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === "time" ? a.v < b.v : a.v > b.v;
}

function announcePR(detail) {
  try { window.dispatchEvent(new CustomEvent("stampede:pr", { detail })); } catch (e) { /* nada */ }
}

// Nuevo récord de RM: se llama ANTES de guardar el registro nuevo.
async function checkRmPR(userId, exercise, weight, unit) {
  try {
    const records = await db.listRmRecords(userId);
    const prev = records.filter((r) => r.exercise === exercise && r.unit === unit);
    if (!prev.length) return;
    const best = Math.max(...prev.map((r) => r.weight));
    if (Number(weight) > best) {
      announcePR({ title: "¡Nuevo PR!", detail: `${exercise}: ${weight} ${unit}`, sub: `Tu marca anterior era ${best} ${unit}` });
    }
  } catch (e) { /* un fallo acá nunca debe impedir guardar */ }
}

// Nuevo récord en un WOD repetido: se llama DESPUÉS de guardar el resultado.
async function checkWodPR({ wod, coachId, userId, saved }) {
  try {
    const sc = resultScore(saved);
    if (!sc || !wod || !coachId) return;
    const lin = await db.listWodLineage(wod, coachId);
    const all = await db.listResultsForWods(lin.map((w) => w.id), userId);
    const prior = all.filter((r) => r.id !== saved.id && (r.scaling || "") === (saved.scaling || "") && resultScore(r) && resultScore(r).kind === sc.kind);
    if (!prior.length) return;
    const better = prior.every((r) => isBetterScore(sc, resultScore(r)));
    if (!better) return;
    const prevBest = prior.reduce((b, r) => (isBetterScore(resultScore(r), resultScore(b)) ? r : b), prior[0]);
    announcePR({ title: "¡Nuevo PR!", detail: `${wod.tipo}: ${formatResultValue(saved)}`, sub: `Tu mejor marca anterior era ${formatResultValue(prevBest)}` });
  } catch (e) { /* nada */ }
}

function PRBanner() {
  const [pr, setPr] = useState(null);
  useEffect(() => {
    let timer;
    const onPr = (e) => {
      setPr(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setPr(null), 7000);
    };
    window.addEventListener("stampede:pr", onPr);
    return () => { window.removeEventListener("stampede:pr", onPr); clearTimeout(timer); };
  }, []);
  if (!pr) return null;
  return (
    <div onClick={() => setPr(null)} style={{
      position: "fixed", top: 14, left: 14, right: 14, zIndex: 9999, maxWidth: 460, margin: "0 auto",
      background: "var(--amber)", color: "#0a1412", borderRadius: 16, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.35)", cursor: "pointer",
      animation: "prpop .35s ease-out",
    }}>
      <style>{"@keyframes prpop{0%{transform:translateY(-30px) scale(.9);opacity:0}100%{transform:none;opacity:1}}"}</style>
      <div style={{ width: 44, height: 44, borderRadius: 22, background: "rgba(10,20,18,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
        <Trophy size={24} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 0.5, textTransform: "uppercase" }}>{pr.title}</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{pr.detail}</div>
        {pr.sub && <div style={{ fontSize: 12, opacity: 0.8 }}>{pr.sub}</div>}
      </div>
    </div>
  );
}

function defaultPlanOwner(user) {
  return user.role === "coach" ? user.id : null; // el id del coach del atleta se resuelve aparte (ver hasCoach)
}

/* ---------------------------- audio beep ---------------------------- */

let audioCtx = null;
function beep(freq = 880, dur = 150, type = "sine", vol = 0.32) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur / 1000);
    osc.stop(audioCtx.currentTime + dur / 1000 + 0.02);
  } catch (e) {}
}

// Los celulares solo permiten "destrabar" el audio si pasa en el mismo
// instante en que el usuario toca algo. Se llama directo en el onClick
// del botón Start, antes de la cuenta regresiva, para que los beeps que
// vienen después (con un retraso de por medio) no queden silenciados.
function primeAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    // un beep inaudible (volumen 0) para "despertar" el audio de una vez
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {}
}

// Mantiene la pantalla encendida mientras un timer está corriendo (si el
// navegador lo soporta). Se libera solo al pausar/desmontar.
function useWakeLock(active) {
  const lockRef = useRef(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let cancelled = false;

    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) { lock.release(); return; }
        lockRef.current = lock;
      } catch (e) { /* el navegador lo puede rechazar, no pasa nada grave */ }
    };
    request();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && active && !lockRef.current) request();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (lockRef.current) { lockRef.current.release().catch(() => {}); lockRef.current = null; }
    };
  }, [active]);
}

/* ============================== ESTILOS ============================== */

function GlobalStyle() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Barlow:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
  return (
    <style>{`
      :root {
        --bg: #0b1113;
        --panel: #151d20;
        --panel-2: #1a2327;
        --line: #26333a;
        --ink: #eef5f3;
        --ink-dim: #8aa19c;
        --amber: #22d3b8;
        --amber-dim: #1a3a36;
        --rust: #ef6a5f;
        --olive: #9ad178;
        --radius: 14px;
        --radius-lg: 20px;
        --radius-pill: 20px;
        --amber-tint: #1a3a36; --amber-ink: #22d3b8;
        --olive-tint: #233521; --olive-ink: #9ad178;
        --rust-tint: #3a2220; --rust-ink: #ef6a5f;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; overscroll-behavior: none; }
      #root { height: 100%; }
      .box-app {
        font-family: 'Barlow', sans-serif;
        background: var(--bg);
        color: var(--ink);
        height: 100vh;
        height: 100dvh;
        width: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .box-topstripe { display: none; }
      .brand-word {
        font-family: 'Rajdhani', sans-serif; font-weight: 700; letter-spacing: 0.02em;
        transform: skewX(-8deg); display: inline-block;
      }
      .box-h1, .box-h2, .box-h3, .box-display {
        font-family: 'Rajdhani', sans-serif;
        margin: 0;
      }
      .box-h1 { font-size: 32px; font-weight: 700; letter-spacing: 0.01em; text-transform: uppercase; line-height: 1; }
      .box-h2 { font-size: 20px; font-weight: 700; letter-spacing: 0.01em; }
      .box-h3 { font-size: 12px; font-weight: 600; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.14em; }
      .box-shell { display: flex; flex: 1; min-height: 0; }
      .box-sidebar {
        width: 190px; flex-shrink: 0; background: var(--panel);
        border-right: 1px solid var(--line); display: flex; flex-direction: column;
        padding: 18px 0;
      }
      .box-brand { display: flex; align-items: center; gap: 10px; padding: 0 16px 20px 16px; }
      .box-navlist { display: flex; flex-direction: column; gap: 2px; flex: 1; }
      .box-navitem {
        display: flex; align-items: center; gap: 12px; padding: 11px 16px 11px 13px;
        cursor: pointer; color: var(--ink-dim); font-size: 14px;
        border: none; border-left: 3px solid transparent; background: transparent; text-align: left; width: 100%;
        font-family: 'Rajdhani', sans-serif; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase;
      }
      .box-navitem:hover { background: var(--panel-2); color: var(--ink); }
      .box-navitem.active { background: var(--panel-2); color: var(--amber); border-left-color: var(--amber); }
      .box-userfoot { border-top: 1px solid var(--line); padding: 12px 16px 0 16px; margin-top: 8px; }
      .box-userrow { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; color: var(--ink-dim); }
      .box-logout { display: flex; align-items: center; gap: 8px; padding: 8px 0; cursor: pointer; color: var(--ink-dim); font-size: 13px; border: none; background: transparent; width: 100%; font-weight: 600; }
      .box-logout:hover { color: var(--amber); }
      .box-main { flex: 1; overflow-y: auto; padding: 22px 26px 90px 26px; }
      .box-bottomnav {
        display: none; position: sticky; bottom: 0; background: var(--panel);
        border-top: 1px solid var(--line); padding: 6px 4px;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      }
      @media (max-width: 720px) {
        .box-sidebar { display: none; }
        .box-bottomnav { display: flex; justify-content: space-around; }
        .box-main { padding: 16px 14px 16px 14px; }
        .box-input, .box-select, textarea.box-input { font-size: 16px; }
      }
      .box-bottomitem { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10px; color: var(--ink-dim); background: none; border: none; padding: 8px 10px; font-family: 'Rajdhani', sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
      .box-bottomitem.active { color: var(--amber); }
      .box-card {
        background: var(--panel); border: 1px solid var(--line); padding: 18px;
        border-radius: var(--radius-lg);
        position: relative;
      }
      .box-btn {
        font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 14px;
        text-transform: uppercase; letter-spacing: 0.05em;
        padding: 12px 22px; border: 1px solid transparent; cursor: pointer;
        display: inline-flex; align-items: center; gap: 8px; justify-content: center;
        border-radius: var(--radius);
        transition: filter 0.1s ease, transform 0.05s ease;
      }
      .box-btn:active { transform: scale(0.97); }
      .box-btn-primary { background: var(--amber); color: #0a1412; }
      .box-btn-primary:hover { filter: brightness(1.1); }
      .box-btn-ghost { background: var(--panel-2); color: var(--ink); border-color: var(--line); }
      .box-btn-ghost:hover { background: var(--line); }
      .box-btn-danger { background: transparent; color: var(--rust); border-color: var(--rust); }
      .box-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      .box-input {
        width: 100%; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius);
        background: var(--panel-2); color: var(--ink); font-family: 'Barlow', sans-serif; font-size: 14px;
      }
      .box-input:focus { outline: none; border-color: var(--amber); }
      .box-label { font-family: 'Rajdhani', sans-serif; font-size: 12px; font-weight: 600; color: var(--ink-dim); margin-bottom: 5px; display: block; text-transform: uppercase; letter-spacing: 0.06em; }
      .box-field { margin-bottom: 14px; }
      .box-select { width: 100%; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); color: var(--ink); font-family: 'Barlow', sans-serif; font-size: 14px; }
      .box-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; padding: 4px 11px; background: var(--olive-tint); color: var(--olive-ink); font-weight: 700; border-radius: var(--radius-pill); text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Rajdhani', sans-serif; }
      .box-error { color: var(--rust); font-size: 13px; margin-top: 6px; }
      .box-success { color: var(--olive); font-size: 13px; margin-top: 6px; }
      .box-muted { color: var(--ink-dim); font-size: 13px; }
      .box-divider { height: 1px; background: var(--line); margin: 16px 0; }
      .box-auth-wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 30px 16px; overflow-y: auto; -webkit-overflow-scrolling: touch; }
      .box-auth-card { width: 100%; max-width: 340px; }
      .box-tabbtn { flex: 1; padding: 10px; border: none; cursor: pointer; font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--panel-2); color: var(--ink-dim); border-radius: var(--radius-pill); }
      .box-tabbtn.active { background: var(--amber-dim); color: var(--amber); }
      .whiteboard { display: flex; flex-direction: column; gap: 14px; }
      .wod-row {
        border: 1px solid var(--line); padding: 18px;
        background: var(--panel); border-radius: var(--radius-lg);
      }
      .wod-type {
        font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 12px; color: var(--amber);
        text-transform: uppercase; letter-spacing: 0.08em; background: var(--amber-dim); border: none;
        padding: 4px 12px; display: inline-block; border-radius: var(--radius-pill);
      }
      .wod-desc { white-space: pre-wrap; line-height: 1.5; margin-top: 10px; font-size: 14.5px; }
      .wod-section { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--line); }
      .wod-section:first-of-type { border-top: none; margin-top: 10px; padding-top: 0; }
      .wod-section-label { font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 11px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.1em; }
      .clock-display { font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 80px; text-align: center; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
      .rm-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
      .rm-row:last-child { border-bottom: none; }
      .scrollx { overflow-x: auto; }
      .week-strip { margin-bottom: 18px; }
      .week-strip-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
      .week-strip-month { font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; }
      .week-strip-days { display: flex; gap: 4px; }
      .week-day {
        flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
        padding: 10px 0; border: 1px solid var(--line); background: var(--panel);
        cursor: pointer; color: var(--ink-dim); position: relative; font-family: 'Barlow', sans-serif;
        border-radius: var(--radius);
      }
      .week-day.active { background: var(--amber-dim); color: var(--amber); border-color: var(--amber); }
      .week-day-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
      .week-day-num { font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 17px; }
      .week-day-dot { width: 4px; height: 4px; background: var(--amber); border-radius: 50%; position: absolute; bottom: 5px; }
      .week-day.active .week-day-dot { background: var(--amber); }
      .icon-btn-circle {
        width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
        background: var(--panel-2); border: 1px solid var(--line); color: var(--ink); cursor: pointer;
        border-radius: 50%;
      }
      .greeting-card {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;
        background: var(--panel); border: 1px solid var(--line);
        padding: 16px 18px; border-radius: var(--radius-lg);
      }
      .greeting-left { display: flex; align-items: center; gap: 12px; }
      .avatar-circle {
        width: 40px; height: 40px; background: linear-gradient(135deg, var(--amber), #0f8a78); color: #0a1412;
        display: flex; align-items: center; justify-content: center; font-family: 'Rajdhani', sans-serif;
        font-weight: 700; font-size: 17px; flex-shrink: 0; border: none;
        border-radius: 50%;
      }
      .greeting-name { font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 18px; letter-spacing: 0.01em; }
      .stats-row { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
      .stat-chip {
        flex: 1 1 140px; display: flex; align-items: center; gap: 10px;
        background: var(--panel); border: 1px solid var(--line); padding: 12px 14px;
        border-radius: var(--radius-lg);
      }
      .stat-icon-circle { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; }
      .stat-chip-value { font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 18px; line-height: 1.1; }
      .stat-chip-label { font-size: 11px; color: var(--ink-dim); margin-top: 2px; }
      .wod-icon-circle {
        width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
        background: var(--amber-tint); color: var(--amber-ink); flex-shrink: 0;
        border-radius: 50%;
      }
      .box-card, .wod-row, .stat-chip, .greeting-card { transition: border-color 0.15s ease, transform 0.1s ease; }
      .wod-row:hover { border-left-color: var(--olive); }
      .icon-btn-circle { transition: background 0.12s ease, transform 0.08s ease; }
      .icon-btn-circle:hover { background: var(--line); transform: translateY(-1px); }
      .box-navitem, .box-bottomitem, .week-day { transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease; }
    `}</style>
  );
}

function HorseShape({ k, x = 0, y = 0, scale = 1, opacity = 1, fill }) {
  const h = HORSES[k];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} fill={fill}>
      <path fillRule="evenodd" d={h.d} />
    </g>
  );
}

function StampedeLoaderAnim() {
  const gid = useId().replace(/:/g, "");
  // 3 caballos de distinto tamaño; cada uno cicla las poses g1 → g2 → g3 → g2
  const horses = [
    { w: 52, bottom: 32, delay: 0.1, duration: 2.3, opacity: 0.4 },
    { w: 70, bottom: 20, delay: 0.55, duration: 2.0, opacity: 0.7 },
    { w: 96, bottom: 8, delay: 0, duration: 1.8, opacity: 1 },
  ];
  const poses = ["g1", "g2", "g3"];
  return (
    <div style={{ textAlign: "center" }}>
      <style>{`
        @keyframes stampede-run { from { transform: translateX(-130px); } to { transform: translateX(300px); } }
        @keyframes stampede-pose-a { 0%, 24.99% { opacity: 1; } 25%, 100% { opacity: 0; } }
        @keyframes stampede-pose-b { 0%, 24.99% { opacity: 0; } 25%, 49.99% { opacity: 1; } 50%, 74.99% { opacity: 0; } 75%, 100% { opacity: 1; } }
        @keyframes stampede-pose-c { 0%, 49.99% { opacity: 0; } 50%, 74.99% { opacity: 1; } 75%, 100% { opacity: 0; } }
        @keyframes stampede-dust { from { transform: translateX(-130px); opacity: 0; } 80% { opacity: .35; } to { transform: translateX(300px); opacity: 0; } }
      `}</style>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id={`tg-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6ff5df" />
            <stop offset="1" stopColor="#12a08b" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: "relative", width: 260, height: 120, margin: "0 auto", overflow: "hidden" }}>
        {horses.map((h, i) => {
          const hh = h.w * (726 / 914);
          return (
            <div key={i} style={{
              position: "absolute", left: 0, bottom: h.bottom, width: h.w, height: hh * 1.15,
              opacity: h.opacity, animation: `stampede-run ${h.duration}s linear infinite`, animationDelay: `${h.delay}s`,
            }}>
              <div style={{
                position: "absolute", left: "-10%", bottom: -2, width: "70%", height: 6, borderRadius: "50%",
                background: "var(--amber)", filter: "blur(3px)", opacity: 0.3,
              }} />
              {poses.map((k, pi) => (
                <svg key={k} viewBox={`0 0 ${HORSES[k].w} ${HORSES[k].h}`} preserveAspectRatio="xMaxYMax meet"
                  style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible",
                    animation: `stampede-pose-${["a", "b", "c"][pi]} ${0.56 + i * 0.04}s step-end infinite`,
                    opacity: pi === 0 ? 1 : 0,
                  }}>
                  <path fillRule="evenodd" d={HORSES[k].d} fill={`url(#tg-${gid})`} />
                </svg>
              ))}
            </div>
          );
        })}
        {[14, 30, 46].map((t, i) => (
          <div key={t} style={{
            position: "absolute", top: t, left: 0, width: 34 - i * 6, height: 2, borderRadius: 1,
            background: "var(--amber)", animation: `stampede-dust ${1.6 + i * 0.25}s linear infinite`, animationDelay: `${i * 0.3}s`,
          }} />
        ))}
      </div>
      <p className="box-muted" style={{ marginTop: 4 }}>Cargando…</p>
    </div>
  );
}

function StampedeLogo({ height = 30 }) {
  const gid = useId().replace(/:/g, "");
  const W = 1560, H = 700;
  return (
    <svg width={(height * W) / H} height={height} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0, overflow: "visible", display: "block" }} aria-label="Stampede" role="img">
      <defs>
        <linearGradient id={`lg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6ff5df" />
          <stop offset="1" stopColor="#12a08b" />
        </linearGradient>
      </defs>
      <HorseShape k="g1" x={0} y={200} scale={0.55} opacity={0.4} fill={`url(#lg-${gid})`} />
      <HorseShape k="g3" x={330} y={110} scale={0.68} opacity={0.7} fill={`url(#lg-${gid})`} />
      <HorseShape k="g2" x={620} y={20} scale={0.95} fill={`url(#lg-${gid})`} />
    </svg>
  );
}

function ProgressRing({ fraction = 0, size = 220, stroke = 12, color = "var(--amber)", trackColor = "var(--panel-2)", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, fraction));
  const offset = c * (1 - clamped);
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.3s" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

function StatChip({ icon: Icon, value, label, tint }) {
  return (
    <div className="stat-chip">
      <div className="stat-icon-circle" style={{ background: `var(--${tint}-tint)`, color: `var(--${tint}-ink)` }}>
        <Icon size={16} />
      </div>
      <div>
        <div className="stat-chip-value">{value}</div>
        <div className="stat-chip-label">{label}</div>
      </div>
    </div>
  );
}

/* ============================== AUTH ============================== */

function PrivacyPolicyText() {
  return (
    <div>
      <h3 className="box-h3" style={{ marginBottom: 6 }}>Qué datos guardamos</h3>
      <p className="box-muted" style={{ marginBottom: 14 }}>
        Nombre, usuario, mail, rol (atleta o coach), y lo que vos cargás: planificación de WODs, RM, resultados y notas de entrenamiento.
        No pedimos ni guardamos DNI, tarjetas, ni datos médicos.
      </p>
      <h3 className="box-h3" style={{ marginBottom: 6 }}>Cómo protegemos tu cuenta</h3>
      <p className="box-muted" style={{ marginBottom: 14 }}>
        El login corre sobre Supabase Auth: tu contraseña nunca pasa por nuestras manos ni se guarda en ningún lado que
        controlemos nosotros — la maneja la infraestructura de autenticación de Supabase, con cifrado estándar de la industria.
      </p>
      <h3 className="box-h3" style={{ marginBottom: 6 }}>Quién puede ver tus datos</h3>
      <p className="box-muted" style={{ marginBottom: 14 }}>
        Solo vos, y el coach al que te vincules (ve tu RM y tus resultados de WOD para poder acompañarte, pero nunca tu contraseña).
        La base de datos tiene reglas de seguridad a nivel de fila (RLS) que impiden que cualquier otra persona pueda leer o
        modificar tus datos, aunque conociera la dirección técnica de la base.
      </p>
      <h3 className="box-h3" style={{ marginBottom: 6 }}>Tus derechos</h3>
      <p className="box-muted">
        Podés pedir la baja de tus datos en cualquier momento desde <b>Ajustes</b>. Se eliminan tu perfil, tus RM, tus resultados
        y tu planificación (si sos coach, tus atletas quedan automáticamente desvinculados).
      </p>
    </div>
  );
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | signup | recover
  const [role, setRole] = useState("atleta");
  const [modality, setModality] = useState("crossfit");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const doLogin = async () => {
    setError(""); setInfo("");
    if (!email || !password) { setError("Completá mail y contraseña."); return; }
    setBusy(true);
    try {
      const user = await db.signIn({ email, password });
      onLogin(user);
    } catch (err) {
      setError(err.message === "Invalid login credentials" ? "Mail o contraseña incorrectos." : err.message || "No pudimos iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  const doSignup = async () => {
    setError(""); setInfo("");
    if (!name || !username.trim() || !email || !password) { setError("Completá todos los campos."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (!acceptedPolicy) { setError("Tenés que aceptar la política de privacidad para crear la cuenta."); return; }
    setBusy(true);
    try {
      const user = await db.signUp({ email, password, name, username, role, modality: role === "atleta" ? modality : "crossfit" });
      onLogin(user);
    } catch (err) {
      if (err.message && err.message.includes("Revisá tu mail")) {
        setInfo(err.message);
        setMode("login");
      } else {
        setError(err.message || "No pudimos crear la cuenta.");
      }
    } finally {
      setBusy(false);
    }
  };

  const doRecover = async () => {
    setError(""); setInfo("");
    if (!email) { setError("Ingresá tu mail."); return; }
    setBusy(true);
    try {
      await db.sendPasswordReset(email);
      setInfo("Listo — revisá tu mail para elegir una contraseña nueva.");
    } catch (err) {
      setError(err.message || "No pudimos enviar el mail de recuperación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="box-auth-wrap">
      <div className="box-auth-card">
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><StampedeLogo height={62} /></div>
          <h1 className="box-h1" style={{ fontSize: 38 }}><span className="brand-word">STAMPEDE</span></h1>
          <div style={{ height: 4, width: 64, margin: "10px auto 12px", background: "repeating-linear-gradient(-45deg, var(--amber) 0 5px, transparent 5px 10px)" }} />
          <p className="box-muted">Tu WOD, tus RM y tus tiempos, en un solo lugar.</p>
        </div>

        {mode !== "recover" && mode !== "privacy" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            <button className={`box-tabbtn ${mode === "login" ? "active" : ""}`} onClick={() => { setMode("login"); setError(""); setInfo(""); }}>Ingresar</button>
            <button className={`box-tabbtn ${mode === "signup" ? "active" : ""}`} onClick={() => { setMode("signup"); setError(""); setInfo(""); }}>Crear cuenta</button>
          </div>
        )}

        {mode === "privacy" && (
          <div className="box-card">
            <PrivacyPolicyText />
            <button type="button" className="box-btn box-btn-primary" style={{ marginTop: 16 }} onClick={() => setMode("signup")}>Volver</button>
          </div>
        )}

        {mode === "login" && (
          <div className="box-card">
            <div className="box-field">
              <label className="box-label">Mail</label>
              <input className="box-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
            </div>
            <div className="box-field">
              <label className="box-label">Contraseña</label>
              <div style={{ position: "relative" }}>
                <input className="box-input" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }} />
                <button type="button" onClick={() => setShowPw((s) => !s)} style={{ position: "absolute", right: 8, top: 8, background: "none", border: "none", color: "var(--ink-dim)", cursor: "pointer" }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {info && <div className="box-success">{info}</div>}
            {error && <div className="box-error">{error}</div>}
            <button type="button" className="box-btn box-btn-primary" style={{ width: "100%", marginTop: 6 }} disabled={busy} onClick={doLogin}>{busy ? "Verificando…" : "Ingresar"}</button>
            <button type="button" onClick={() => { setMode("recover"); setError(""); setInfo(""); }} className="box-muted" style={{ background: "none", border: "none", cursor: "pointer", marginTop: 12, width: "100%", textAlign: "center", textDecoration: "underline" }}>
              Olvidé mi contraseña
            </button>
          </div>
        )}

        {mode === "signup" && (
          <div className="box-card">
            <div className="box-field">
              <label className="box-label">Sos...</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className={`box-tabbtn ${role === "atleta" ? "active" : ""}`} onClick={() => setRole("atleta")}>
                  <User size={14} style={{ marginRight: 6 }} /> Atleta
                </button>
                <button type="button" className={`box-tabbtn ${role === "coach" ? "active" : ""}`} onClick={() => setRole("coach")}>
                  <Users size={14} style={{ marginRight: 6 }} /> Coach
                </button>
              </div>
            </div>
            {role === "atleta" && (
              <div className="box-field">
                <label className="box-label">Modalidad</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {MODALITIES.map((m) => (
                    <button key={m.id} type="button" className={`box-tabbtn ${modality === m.id ? "active" : ""}`} onClick={() => setModality(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {modality !== "crossfit" && (
                  <p className="box-muted" style={{ marginTop: 8, fontSize: 12 }}>
                    Estamos terminando de armar la experiencia de {modalityLabel(modality)}. Vas a poder crear tu cuenta y usar la app; algunas pantallas todavía están en construcción para esta modalidad.
                  </p>
                )}
              </div>
            )}
            <div className="box-field">
              <label className="box-label">Nombre</label>
              <input className="box-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="box-field">
              <label className="box-label">Usuario (para que te vinculen)</label>
              <input className="box-input" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
            </div>
            <div className="box-field">
              <label className="box-label">Mail</label>
              <input className="box-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@mail.com" />
            </div>
            <div className="box-field">
              <label className="box-label">Contraseña</label>
              <input className="box-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14, fontSize: 13, color: "var(--ink-dim)", cursor: "pointer" }}>
              <input type="checkbox" checked={acceptedPolicy} onChange={(e) => setAcceptedPolicy(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                Acepto la{" "}
                <span style={{ color: "var(--amber)", textDecoration: "underline" }} onClick={(e) => { e.preventDefault(); setMode("privacy"); }}>
                  política de privacidad
                </span>.
              </span>
            </label>
            {error && <div className="box-error">{error}</div>}
            <button type="button" className="box-btn box-btn-primary" style={{ width: "100%" }} disabled={busy} onClick={doSignup}>{busy ? "Creando…" : "Crear cuenta"}</button>
          </div>
        )}

        {mode === "recover" && (
          <div className="box-card">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <KeyRound size={16} color="var(--amber)" />
              <span className="box-h2">Recuperar contraseña</span>
            </div>
            <div className="box-field">
              <label className="box-label">Mail</label>
              <input className="box-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {info && <div className="box-success">{info}</div>}
            {error && <div className="box-error">{error}</div>}
            <button type="button" className="box-btn box-btn-primary" style={{ width: "100%" }} disabled={busy} onClick={doRecover}>
              {busy ? "Enviando…" : "Enviar mail de recuperación"}
            </button>
            <button type="button" onClick={() => { setMode("login"); setError(""); setInfo(""); }} className="box-muted" style={{ background: "none", border: "none", cursor: "pointer", marginTop: 12, width: "100%", textAlign: "center", textDecoration: "underline" }}>
              Volver a ingresar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SetNewPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError("");
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    setBusy(true);
    try {
      await db.updateMyPassword(password);
      onDone();
    } catch (err) {
      setError(err.message || "No pudimos actualizar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="box-auth-wrap">
      <div className="box-auth-card box-card">
        <h2 className="box-h2" style={{ marginBottom: 12 }}>Elegí tu nueva contraseña</h2>
        <div className="box-field">
          <label className="box-label">Nueva contraseña</label>
          <input className="box-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="box-error">{error}</div>}
        <button className="box-btn box-btn-primary" style={{ width: "100%" }} disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar y entrar"}</button>
      </div>
    </div>
  );
}

/* ============================== LINK COACH ============================== */

function LinkCoachForm({ user, onLinked, compact }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const link = async () => {
    setError("");
    if (!code.trim()) return;
    setBusy(true);
    try {
      await db.linkCoach(user.id, code);
      setCode("");
      onLinked();
    } catch (err) {
      setError(err.message || "No pudimos vincular con ese coach.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "" : "box-card"}>
      {!compact && <h2 className="box-h2" style={{ marginBottom: 8 }}>Vincularte con tu coach</h2>}
      <p className="box-muted" style={{ marginBottom: 10 }}>Pedile a tu coach su usuario y pegalo acá para recibir su planificación.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="box-input" placeholder="usuario del coach" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="box-btn box-btn-primary" onClick={link} disabled={busy}><Link2 size={14} /> Vincular</button>
      </div>
      {error && <div className="box-error">{error}</div>}
    </div>
  );
}

/* ============================== WEEK STRIP ============================== */

function WeekStrip({ selectedDate, onSelect, markedDates }) {
  const base = selectedDate ? new Date(selectedDate + "T00:00:00") : new Date();
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const monthLabel = monday.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const goWeek = (delta) => {
    const d = new Date(base);
    d.setDate(base.getDate() + delta * 7);
    onSelect(toKey(d));
  };

  return (
    <div className="week-strip">
      <div className="week-strip-top">
        <span className="week-strip-month">{monthLabel}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="icon-btn-circle" onClick={() => goWeek(-1)}><ChevronLeft size={15} /></button>
          <button className="icon-btn-circle" onClick={() => goWeek(1)}><ChevronRight size={15} /></button>
        </div>
      </div>
      <div className="week-strip-days">
        {days.map((d) => {
          const key = toKey(d);
          const isSel = key === selectedDate;
          const isToday = key === todayKey();
          const hasWod = markedDates?.has(key);
          return (
            <button key={key} className={`week-day ${isSel ? "active" : ""}`} onClick={() => onSelect(isSel ? "" : key)}>
              <span className="week-day-label">{d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "").slice(0, 3)}</span>
              <span className="week-day-num">{d.getDate()}</span>
              {(hasWod || isToday) && <span className="week-day-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== ESTADÍSTICAS ============================== */

function MonthNav({ monthDate, onChange }) {
  const label = monthDate.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const shift = (delta) => {
    const d = new Date(monthDate);
    d.setMonth(d.getMonth() + delta);
    onChange(d);
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <button className="icon-btn-circle" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
      <span className="box-h2" style={{ textTransform: "capitalize" }}>{label}</span>
      <button className="icon-btn-circle" onClick={() => shift(1)}><ChevronRight size={15} /></button>
    </div>
  );
}

function useAthleteData(userId) {
  const [rmRecords, setRmRecords] = useState(null);
  const [results, setResults] = useState([]);

  const reload = useCallback(() => {
    if (!userId) return;
    db.listRmRecords(userId).then(setRmRecords).catch(() => setRmRecords([]));
    db.listMyResults(userId).then(setResults).catch(() => setResults([]));
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  return { rmRecords, results, reload };
}

function MonthlyStats({ userId }) {
  const { rmRecords, results: notesFlat } = useAthleteData(userId);
  const [monthDate, setMonthDate] = useState(new Date());

  const prevMonthDate = useMemo(() => {
    const d = new Date(monthDate);
    d.setMonth(d.getMonth() - 1);
    return d;
  }, [monthDate]);

  const rmThisMonth = useMemo(() => (rmRecords || []).filter((r) => isInMonth(r.date, monthDate)), [rmRecords, monthDate]);
  const rmPrevMonth = useMemo(() => (rmRecords || []).filter((r) => isInMonth(r.date, prevMonthDate)), [rmRecords, prevMonthDate]);
  const wodThisMonth = useMemo(() => notesFlat.filter((n) => isInMonth(n.dateKey, monthDate)), [notesFlat, monthDate]);

  const daysTrained = useMemo(() => new Set(wodThisMonth.map((n) => n.dateKey)).size, [wodThisMonth]);

  const byTipo = useMemo(() => {
    const map = {};
    wodThisMonth.forEach((n) => { map[n.tipo || "WOD"] = (map[n.tipo || "WOD"] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [wodThisMonth]);

  const byExercise = useMemo(() => {
    const map = {};
    rmThisMonth.forEach((r) => {
      map[r.exercise] = map[r.exercise] || { count: 0, max: -Infinity, unit: r.unit };
      map[r.exercise].count++;
      map[r.exercise].max = Math.max(map[r.exercise].max, r.weight);
    });
    const prevMax = {};
    rmPrevMonth.forEach((r) => { prevMax[r.exercise] = Math.max(prevMax[r.exercise] ?? -Infinity, r.weight); });
    return Object.entries(map)
      .map(([ex, v]) => ({ ex, ...v, delta: prevMax[ex] !== undefined ? v.max - prevMax[ex] : null }))
      .sort((a, b) => b.max - a.max);
  }, [rmThisMonth, rmPrevMonth]);

  const allDateKeys = useMemo(() => notesFlat.map((n) => n.dateKey).filter(Boolean), [notesFlat]);
  const streaks = useMemo(() => computeStreaks(allDateKeys), [allDateKeys]);
  const trendData = useMemo(() => weeklyTrend(allDateKeys, 8), [allDateKeys]);

  const allTimeRecords = useMemo(() => {
    const map = {};
    (rmRecords || []).forEach((r) => {
      if (!map[r.exercise] || r.weight > map[r.exercise].weight) map[r.exercise] = r;
    });
    return Object.values(map).sort((a, b) => a.exercise.localeCompare(b.exercise));
  }, [rmRecords]);

  if (rmRecords === null) return <p className="box-muted">Cargando estadísticas…</p>;

  return (
    <div>
      <MonthNav monthDate={monthDate} onChange={setMonthDate} />

      <div className="stats-row">
        <StatChip icon={ClipboardList} value={wodThisMonth.length} label="WODs este mes" tint="amber" />
        <StatChip icon={CalendarDays} value={daysTrained} label="Días entrenados" tint="olive" />
        <StatChip icon={Dumbbell} value={rmThisMonth.length} label="RM cargados" tint="rust" />
      </div>

      <div className="box-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h3 className="box-h3">Constancia</h3>
          <div style={{ display: "flex", gap: 16 }}>
            <span className="box-muted">Racha actual: <b style={{ color: "var(--ink)" }}>{streaks.current} {streaks.current === 1 ? "día" : "días"}</b></span>
            <span className="box-muted">Mejor racha: <b style={{ color: "var(--ink)" }}>{streaks.best} {streaks.best === 1 ? "día" : "días"}</b></span>
          </div>
        </div>
        <ConsistencyHeatmap dateKeys={allDateKeys} weeks={12} />
      </div>

      <div className="box-card" style={{ marginBottom: 18 }}>
        <h3 className="box-h3" style={{ marginBottom: 10 }}>Tendencia (últimas 8 semanas)</h3>
        {trendData.every((b) => b.wods === 0) ? (
          <p className="box-muted">Todavía no hay resultados registrados en este período.</p>
        ) : (
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--ink-dim)" fontSize={11} />
                <YAxis stroke="var(--ink-dim)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} />
                <Bar dataKey="wods" name="WODs" fill="var(--amber)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="box-card" style={{ marginBottom: 18 }}>
        <h3 className="box-h3" style={{ marginBottom: 10 }}>WODs por tipo este mes</h3>
        {byTipo.length === 0 && <p className="box-muted">Todavía no hay resultados registrados este mes.</p>}
        {byTipo.map(([tipo, count]) => (
          <div className="rm-row" key={tipo}><span>{tipo}</span><b>{count}</b></div>
        ))}
      </div>

      <div className="box-card" style={{ marginBottom: 18 }}>
        <h3 className="box-h3" style={{ marginBottom: 10 }}>Marcas por ejercicio este mes</h3>
        {byExercise.length === 0 && <p className="box-muted">Todavía no hay RM cargados este mes.</p>}
        {byExercise.map((e) => (
          <div className="rm-row" key={e.ex}>
            <div>
              <div>{e.ex}</div>
              <div className="box-muted">{e.count} {e.count === 1 ? "registro" : "registros"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700 }}>{e.max} {e.unit}</div>
              {e.delta !== null && e.delta !== 0 && (
                <div className="box-muted" style={{ color: e.delta > 0 ? "var(--olive)" : "var(--rust)" }}>
                  {e.delta > 0 ? "+" : ""}{e.delta} {e.unit} vs mes anterior
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="box-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 className="box-h3">Mis récords (histórico)</h3>
          {allTimeRecords.length > 0 && (
            <button className="box-btn box-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
              onClick={() => downloadCSV(`records-${userId}.csv`, allTimeRecords, ["exercise", "weight", "unit", "date", "note"])}>
              <Download size={13} /> CSV
            </button>
          )}
        </div>
        {allTimeRecords.length === 0 && <p className="box-muted">Todavía no cargaste ningún RM.</p>}
        {allTimeRecords.map((r) => (
          <div className="rm-row" key={r.exercise}>
            <span>{r.exercise}</span>
            <span>
              <b>{r.weight} {r.unit}</b> <span className="box-muted">({r.date})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsistencyHeatmap({ dateKeys, weeks = 12 }) {
  const counts = useMemo(() => {
    const map = {};
    dateKeys.forEach((k) => { map[k] = (map[k] || 0) + 1; });
    return map;
  }, [dateKeys]);

  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + mondayOffset); thisMonday.setHours(0, 0, 0, 0);

  const weekCols = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = new Date(thisMonday); monday.setDate(thisMonday.getDate() - w * 7);
    const days = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(monday); dt.setDate(monday.getDate() + d);
      const key = toKey(dt);
      days.push({ key, count: counts[key] || 0, future: dt > today });
    }
    weekCols.push(days);
  }

  const colorFor = (count, future) => {
    if (future) return "transparent";
    if (count === 0) return "var(--panel-2)";
    if (count === 1) return "var(--amber-dim)";
    return "var(--amber)";
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 4 }}>
        {weekCols.map((col, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {col.map((d) => (
              <div key={d.key} title={`${d.key}: ${d.count} WOD${d.count === 1 ? "" : "s"}`} style={{ width: 11, height: 11, borderRadius: 3, background: colorFor(d.count, d.future), border: d.future ? "none" : "1.5px solid var(--ink)" }} />
            ))}
          </div>
        ))}
      </div>
      <div className="box-muted" style={{ marginTop: 8, fontSize: 11 }}>Últimas {weeks} semanas · más oscuro = más actividad</div>
    </div>
  );
}

const PERIOD_OPTIONS = [
  ["month", "Mensual"],
  ["quarter", "Trimestral"],
  ["half", "Semestral"],
  ["year", "Anual"],
];

function EvolutionStats({ userId }) {
  const { rmRecords, results: notesFlat } = useAthleteData(userId);
  const [granularity, setGranularity] = useState("month");
  const [exercise, setExercise] = useState(null);

  const exerciseList = useMemo(() => Array.from(new Set((rmRecords || []).map((r) => r.exercise))).sort(), [rmRecords]);

  useEffect(() => {
    if (!exercise && exerciseList.length) setExercise(exerciseList[0]);
    if (exercise && !exerciseList.includes(exercise) && exerciseList.length) setExercise(exerciseList[0]);
  }, [exerciseList, exercise]);

  const rmEvolution = useMemo(() => {
    if (!exercise || !rmRecords) return [];
    const filtered = rmRecords.filter((r) => r.exercise === exercise);
    const buckets = bucketByPeriod(filtered, granularity, (r) => new Date(r.date));
    return buckets.slice(-12).map((b) => ({
      label: b.label,
      weight: Math.max(...b.items.map((r) => r.weight)),
      unit: b.items[0].unit,
    }));
  }, [exercise, rmRecords, granularity]);

  const wodEvolution = useMemo(() => {
    const buckets = bucketByPeriod(notesFlat, granularity, (n) => new Date(n.dateKey + "T00:00:00"));
    return buckets.slice(-12).map((b) => {
      const amrapVals = b.items.filter((n) => (n.tipo || "").toUpperCase() === "AMRAP" && n.rounds != null).map((n) => n.rounds + (n.reps || 0) / 100);
      const ftVals = b.items.filter((n) => (n.tipo || "").toLowerCase() === "for time").map((n) => parseClockSeconds(n.time)).filter((v) => v != null);
      return {
        label: b.label,
        wods: b.items.length,
        amrapAvg: amrapVals.length ? Math.round((amrapVals.reduce((a, c) => a + c, 0) / amrapVals.length) * 100) / 100 : null,
        forTimeAvgSec: ftVals.length ? Math.round(ftVals.reduce((a, c) => a + c, 0) / ftVals.length) : null,
      };
    });
  }, [notesFlat, granularity]);

  const hasAmrapData = wodEvolution.some((w) => w.amrapAvg != null);
  const hasForTimeData = wodEvolution.some((w) => w.forTimeAvgSec != null);

  if (rmRecords === null) return null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h3 className="box-h3">Evolución</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERIOD_OPTIONS.map(([g, label]) => (
            <button key={g} className={`box-tabbtn ${granularity === g ? "active" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setGranularity(g)}>{label}</button>
          ))}
        </div>
      </div>

      {exerciseList.length > 0 && (
        <div className="box-card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <h3 className="box-h3">Pesos — evolución por ejercicio</h3>
            <select className="box-select" style={{ width: 200 }} value={exercise || ""} onChange={(e) => setExercise(e.target.value)}>
              {exerciseList.map((ex) => <option key={ex}>{ex}</option>)}
            </select>
          </div>
          {rmEvolution.length < 2 ? (
            <p className="box-muted">Necesita al menos dos períodos con marcas cargadas para mostrar la evolución.</p>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rmEvolution}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="var(--ink-dim)" fontSize={11} />
                  <YAxis stroke="var(--ink-dim)" fontSize={11} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} formatter={(v) => [`${v} ${rmEvolution[0]?.unit || ""}`, "Mejor marca"]} />
                  <Line type="monotone" dataKey="weight" stroke="var(--amber)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <div className="box-card" style={{ marginBottom: 18 }}>
        <h3 className="box-h3" style={{ marginBottom: 10 }}>Volumen de entrenamiento</h3>
        {wodEvolution.length === 0 ? (
          <p className="box-muted">Todavía no hay resultados registrados.</p>
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wodEvolution}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--ink-dim)" fontSize={11} />
                <YAxis stroke="var(--ink-dim)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} />
                <Bar dataKey="wods" name="WODs" fill="var(--amber)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {hasAmrapData && (
        <div className="box-card" style={{ marginBottom: 18 }}>
          <h3 className="box-h3" style={{ marginBottom: 10 }}>Capacidad — AMRAP (rondas promedio)</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wodEvolution}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--ink-dim)" fontSize={11} />
                <YAxis stroke="var(--ink-dim)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} formatter={(v) => [`${v} rondas`, "Promedio"]} />
                <Line type="monotone" dataKey="amrapAvg" name="Rondas promedio" stroke="var(--olive)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="box-muted" style={{ marginTop: 8, fontSize: 12 }}>Rondas completas + reps extra (ej: 5.12 = 5 rondas y 12 reps). Más alto = mejor capacidad de trabajo.</p>
        </div>
      )}

      {hasForTimeData && (
        <div className="box-card">
          <h3 className="box-h3" style={{ marginBottom: 10 }}>Capacidad — For Time (tiempo promedio)</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wodEvolution}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--ink-dim)" fontSize={11} />
                <YAxis stroke="var(--ink-dim)" fontSize={11} tickFormatter={(v) => fmtClock(v)} />
                <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} formatter={(v) => [fmtClock(v), "Tiempo promedio"]} />
                <Line type="monotone" dataKey="forTimeAvgSec" name="Tiempo" stroke="var(--rust)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="box-muted" style={{ marginTop: 8, fontSize: 12 }}>Tendencia general de tus tiempos en WODs "For Time" (son distintos entre sí). Más bajo = mejor.</p>
        </div>
      )}
    </div>
  );
}

function EvolutionSummary({ userId }) {
  const { rmRecords, results: notesFlat } = useAthleteData(userId);

  const allDateKeys = useMemo(() => notesFlat.map((n) => n.dateKey).filter(Boolean), [notesFlat]);
  const streaks = useMemo(() => computeStreaks(allDateKeys), [allDateKeys]);

  const bestImprovement = useMemo(() => {
    if (!rmRecords || !rmRecords.length) return null;
    const byEx = {};
    rmRecords.forEach((r) => {
      byEx[r.exercise] = byEx[r.exercise] || [];
      byEx[r.exercise].push(r);
    });
    let best = null;
    Object.values(byEx).forEach((list) => {
      if (list.length < 2) return;
      const sorted = list.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const first = sorted[0].weight;
      const max = Math.max(...list.map((r) => r.weight));
      const delta = max - first;
      if (delta > 0 && (!best || delta > best.delta)) best = { ex: sorted[0].exercise, delta, unit: sorted[0].unit, first, max };
    });
    return best;
  }, [rmRecords]);

  if (rmRecords === null) return null;

  return (
    <div className="box-card" style={{ marginBottom: 18 }}>
      <h3 className="box-h3" style={{ marginBottom: 12 }}>Tu evolución en una mirada</h3>
      <div className="stats-row" style={{ marginBottom: bestImprovement ? 14 : 0 }}>
        <StatChip icon={Flame} value={streaks.current} label="Racha actual (días)" tint="amber" />
        <StatChip icon={TrendingUp} value={streaks.best} label="Mejor racha" tint="olive" />
        <StatChip icon={ClipboardList} value={notesFlat.length} label="WODs registrados" tint="rust" />
      </div>
      {bestImprovement && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <ArrowUpRight size={20} color="var(--olive)" />
          <div>
            <div className="box-muted">Tu mayor mejora hasta ahora</div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 17 }}>
              {bestImprovement.ex}: +{bestImprovement.delta} {bestImprovement.unit} ({bestImprovement.first} → {bestImprovement.max})
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsScreen({ user }) {
  const [athletes, setAthletes] = useState([]);
  const [athletesLoaded, setAthletesLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(user.id);

  useEffect(() => {
    if (user.role !== "coach") return;
    db.listMyAthletes(user.username).then((list) => { setAthletes(list); setAthletesLoaded(true); });
  }, [user.role, user.username]);

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Estadísticas</h1>

      {user.role === "coach" && (
        <div className="box-field" style={{ maxWidth: 280 }}>
          <label className="box-label">Ver estadísticas de</label>
          <select className="box-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value={user.id}>{user.name} (vos)</option>
            {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {athletesLoaded && athletes.length === 0 && (
            <span className="box-muted" style={{ fontSize: 12 }}>Todavía no tenés atletas vinculados — compartí tu usuario desde "Mis atletas" para que se sumen.</span>
          )}
        </div>
      )}

      <EvolutionSummary key={`sum-${selectedId}`} userId={selectedId} />
      <MonthlyStats key={`m-${selectedId}`} userId={selectedId} />

      <div className="box-divider" />
      <EvolutionStats key={`ev-${selectedId}`} userId={selectedId} />
    </div>
  );
}

/* ============================== WOD BOARD ============================== */

function wodIconFor(tipo = "") {
  const t = tipo.toLowerCase();
  if (t.includes("amrap")) return Repeat;
  if (t.includes("emom") || t.includes("otm")) return Clock;
  if (t.includes("tabata")) return Zap;
  if (t.includes("time")) return TimerIcon;
  return Dumbbell;
}

/* ---------------------------- plantillas del coach ---------------------------- */

function TemplateBar({ coachId, kind, getData, onApply, filter }) {
  const [templates, setTemplates] = useState(null); // null = cargando, false = no disponible todavía
  const [picked, setPicked] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    db.listTemplates(coachId, kind).then(setTemplates).catch(() => setTemplates(false));
  }, [coachId, kind]);
  useEffect(() => { load(); }, [load]);

  if (templates === null || templates === false) return null; // sin migración v7 no se muestra nada
  const visible = filter ? templates.filter(filter) : templates;

  const apply = (id) => {
    setPicked(id); setConfirmDel(false);
    const t = visible.find((x) => x.id === id);
    if (t) onApply(t.data);
  };

  const save = async () => {
    const n = name.trim();
    if (!n) { setErr("Ponele un nombre a la plantilla."); return; }
    try {
      await db.createTemplate(coachId, kind, n, getData());
      setNaming(false); setName(""); setErr("");
      load();
    } catch (e) { setErr(e.message || "No se pudo guardar la plantilla."); }
  };

  const remove = async () => {
    try { await db.deleteTemplate(picked); } catch (e) { /* nada */ }
    setPicked(""); setConfirmDel(false);
    load();
  };

  return (
    <div style={{ background: "var(--panel-2)", borderRadius: 12, padding: 10, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {visible.length > 0 && (
          <select className="box-select" style={{ flex: "1 1 180px", minWidth: 0 }} value={picked} onChange={(e) => apply(e.target.value)}>
            <option value="">Usar plantilla…</option>
            {visible.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {picked && !confirmDel && (
          <button type="button" className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={() => setConfirmDel(true)} title="Borrar plantilla"><Trash2 size={13} /></button>
        )}
        {picked && confirmDel && (
          <>
            <button type="button" className="box-btn box-btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={remove}>Borrar plantilla</button>
            <button type="button" className="box-btn box-btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setConfirmDel(false)}>No</button>
          </>
        )}
        {!naming && (
          <button type="button" className="box-btn box-btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => { setNaming(true); setErr(""); }}>
            <Plus size={13} /> Guardar como plantilla
          </button>
        )}
      </div>
      {naming && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="box-input" style={{ flex: "1 1 180px" }} placeholder="Nombre de la plantilla" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="box-btn box-btn-primary" onClick={save}><Check size={14} /> Guardar</button>
          <button type="button" className="box-btn box-btn-ghost" onClick={() => { setNaming(false); setErr(""); }}><X size={14} /></button>
        </div>
      )}
      {err && <div className="box-error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

function WodBoard({ user, onUserUpdate, onCoachesReload, sourceKey, onSourceChange }) {
  const [rawWods, setRawWods] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [openRow, setOpenRow] = useState(null);
  const [resultsByWod, setResultsByWod] = useState({});
  const [coachComments, setCoachComments] = useState({});
  const [formTime, setFormTime] = useState("");
  const [formRounds, setFormRounds] = useState("");
  const [formReps, setFormReps] = useState("");
  const [formScaling, setFormScaling] = useState("RX");
  const [formComment, setFormComment] = useState("");
  const [rmCount, setRmCount] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [repeatingId, setRepeatingId] = useState(null);
  const [repeatDate, setRepeatDate] = useState(todayKey());
  const [comparingRow, setComparingRow] = useState(null);
  const [lineage, setLineage] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formDate, setFormDate] = useState(todayKey());
  const [formTipo, setFormTipo] = useState("For Time");
  const [formMovilidad, setFormMovilidad] = useState("");
  const [formCore, setFormCore] = useState("");
  const [formSkillType, setFormSkillType] = useState("Gimnástico");
  const [formSkillContent, setFormSkillContent] = useState("");
  const [formEstructura, setFormEstructura] = useState("");
  const [formWod, setFormWod] = useState("");
  const [formExtra, setFormExtra] = useState("");
  const [formError, setFormError] = useState("");
  const [formAudienceMode, setFormAudienceMode] = useState("all");
  const [formAudience, setFormAudience] = useState([]);
  const [myAthletes, setMyAthletes] = useState([]);
  const [saving, setSaving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState("");

  const isCoach = user.role === "coach";
  const coaches = user.coaches || [];
  const sources = useMemo(() => {
    const list = isCoach ? [{ key: "own", label: "Mi planificación", coachId: user.id, editable: true }] : [];
    coaches.forEach((c) => list.push({ key: c.username, label: isCoach ? `Plan de ${c.name}` : c.name, coachId: c.id, editable: false }));
    return list;
  }, [isCoach, coaches, user.id]);

  // El coach/plan elegido vive en App (no acá) para que no se pierda al cambiar de pantalla.
  const setSourceKey = (k) => onSourceChange && onSourceChange(k);
  useEffect(() => {
    if (sources.length && (!sourceKey || !sources.some((s) => s.key === sourceKey))) {
      onSourceChange && onSourceChange(sources[0].key, { auto: true });
    }
  }, [sources, sourceKey]);

  const activeSource = sources.find((s) => s.key === sourceKey) || null;
  const planOwnerId = activeSource?.coachId || null;
  const canEdit = !!activeSource?.editable;

  useEffect(() => {
    db.listRmRecords(user.id).then((r) => setRmCount(r.length));
  }, [user.id]);

  useEffect(() => {
    if (isCoach) db.getCoachSheetUrl(user.id).then(setImportUrl);
  }, [isCoach, user.id]);

  useEffect(() => {
    if (isCoach) db.listMyAthletes(user.username).then(setMyAthletes).catch(() => {});
  }, [isCoach, user.username]);

  const loadWods = useCallback(async () => {
    if (!planOwnerId) { setLoading(false); setRawWods([]); return; }
    setLoading(true);
    const list = await db.listWods(planOwnerId);
    setRawWods(list);
    setLoading(false);
  }, [planOwnerId]);

  useEffect(() => { loadWods(); }, [loadWods]);

  const loadResults = useCallback(async () => {
    const list = await db.listMyResults(user.id);
    const map = {};
    list.forEach((n) => { (map[n.wodId] = map[n.wodId] || []).push(n); });
    setResultsByWod(map);
    // Comentarios que el coach dejó sobre estos resultados (si la migración v7 no está, no pasa nada).
    db.listCommentsForUser(user.id).then((cs) => {
      const byRes = {};
      cs.forEach((c) => { (byRes[c.resultId] = byRes[c.resultId] || []).push(c); });
      setCoachComments(byRes);
    }).catch(() => {});
  }, [user.id]);

  useEffect(() => { loadResults(); }, [loadResults]);

  const rows = useMemo(() => {
    return (rawWods || [])
      .map((w) => ({ ...w, date: new Date(w.dateKey + "T00:00:00") }))
      .sort((a, b) => b.date - a.date);
  }, [rawWods]);

  const filtered = useMemo(() => {
    if (!filterDate) return rows;
    return rows.filter((r) => r.dateKey === filterDate);
  }, [rows, filterDate]);

  const markedDates = useMemo(() => new Set(rows.map((r) => r.dateKey)), [rows]);

  const totalNotes = useMemo(() => Object.values(resultsByWod).reduce((a, l) => a + l.length, 0), [resultsByWod]);

  const wodsThisWeek = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now); monday.setDate(now.getDate() + mondayOffset); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    return rows.filter((r) => r.date >= monday && r.date <= sunday).length;
  }, [rows]);

  const saveNote = async (row) => {
    const saved = await db.addResult({
      wodId: row.id, userId: user.id, time: formTime,
      rounds: formRounds ? Number(formRounds) : null, reps: formReps ? Number(formReps) : null,
      scaling: formScaling, comment: formComment,
    });
    checkWodPR({ wod: row, coachId: planOwnerId, userId: user.id, saved });
    await loadResults();
    setFormTime(""); setFormRounds(""); setFormReps(""); setFormComment(""); setFormScaling("RX");
    setOpenRow(null);
  };

  const markComplete = async (row) => {
    await db.markWodComplete(row.id, user.id);
    await loadResults();
  };

  // Si el coach estaba mirando el plan de otro coach, vuelve a "Mi planificación" para poder crear.
  const goOwnPlan = () => { if (isCoach && !canEdit) onSourceChange && onSourceChange("own", { auto: true }); };

  const openNewForm = () => {
    goOwnPlan();
    setFormAudienceMode("all"); setFormAudience([]);
    setEditingId(null);
    setFormDate(filterDate || todayKey());
    setFormTipo("For Time");
    setFormMovilidad(""); setFormCore(""); setFormSkillType("Gimnástico"); setFormSkillContent("");
    setFormEstructura(""); setFormWod(""); setFormExtra(""); setFormError("");
    setShowForm(true); setShowImport(false);
  };

  const openEditForm = (row) => {
    setEditingId(row.id);
    setFormDate(row.dateKey);
    setFormTipo(row.tipo);
    setFormMovilidad(row.movilidad || ""); setFormCore(row.core || "");
    setFormSkillType(row.skillType || "Gimnástico"); setFormSkillContent(row.skillContent || "");
    setFormEstructura(row.estructura || ""); setFormWod(row.wod || ""); setFormExtra(row.extraNotes || "");
    setFormError("");
    setFormAudienceMode(row.audience && row.audience.length ? "some" : "all");
    setFormAudience(row.audience || []);
    setShowForm(true); setShowImport(false);
  };

  const submitForm = async () => {
    setFormError("");
    if (!formDate) { setFormError("La fecha es obligatoria."); return; }
    if (!formWod.trim()) { setFormError("Completá el WOD antes de guardar."); return; }
    if (formAudienceMode === "some" && formAudience.length === 0) { setFormError("Elegí al menos un atleta, o poné \"Todos mis atletas\"."); return; }
    const payload = {
      audience: formAudienceMode === "some" ? formAudience : [],
      dateKey: formDate, tipo: formTipo, movilidad: formMovilidad.trim(), core: formCore.trim(),
      skillType: formSkillType, skillContent: formSkillContent.trim(), estructura: formEstructura.trim(),
      wod: formWod.trim(), extraNotes: formExtra.trim(),
    };
    setSaving(true);
    try {
      if (editingId) await db.updateWod(editingId, payload);
      else await db.createWod(user.id, payload);
      await loadWods();
      setShowForm(false);
    } catch (e) {
      setFormError(e && e.message ? `No se pudo guardar: ${e.message}` : "No se pudo guardar el WOD. Probá de nuevo.");
    }
    setSaving(false);
  };

  const deleteWod = async (id) => {
    await db.deleteWod(id);
    await loadWods();
    setConfirmDeleteId(null);
  };

  const doRepeat = async (row) => {
    await db.repeatWod(row, repeatDate, planOwnerId);
    await loadWods();
    setRepeatingId(null);
  };

  const openCompare = async (row) => {
    setComparingRow(row);
    setLineage(null);
    const lin = await db.listWodLineage(row, planOwnerId);
    const results = await db.listResultsForWods(lin.map((w) => w.id), user.id);
    const byWod = {};
    results.forEach((r) => { (byWod[r.wodId] = byWod[r.wodId] || []).push(r); });
    setLineage(lin.map((w) => ({ ...w, myResults: (byWod[w.id] || []).sort((a, b) => b.savedAt - a.savedAt) })));
  };

  const closeCompare = () => { setComparingRow(null); setLineage(null); };

  const doImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportErr("");
    try {
      await db.setCoachSheetUrl(user.id, importUrl.trim());
      const res = await fetch(importUrl.trim());
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const cleaned = parsed.data.map((r) => {
        const keys = Object.keys(r);
        const get = (name) => {
          const k = keys.find((k) => k.toLowerCase().trim().startsWith(name));
          return k ? (r[k] || "").trim() : "";
        };
        const dt = parseDateFlexible(get("fecha"));
        return {
          dateKey: toKey(dt),
          tipo: get("tipo") || "WOD",
          wod: get("ejerc") || get("descrip") || keys.map((k) => r[k]).filter(Boolean).join(" — "),
          extraNotes: get("nota"),
        };
      }).filter((r) => r.wod && r.dateKey !== "sin-fecha");
      if (cleaned.length) await db.importWodsFromRows(user.id, cleaned);
      await loadWods();
      setShowImport(false);
    } catch (e) {
      setImportErr("No pude leer esa planilla. Revisá que esté publicada como CSV.");
    }
    setImporting(false);
  };

  if (!isCoach && coaches.length === 0) {
    return (
      <div>
        <h1 className="box-h1" style={{ marginBottom: 14 }}>Planificación</h1>
        <LinkCoachForm user={user} onLinked={onCoachesReload} />
      </div>
    );
  }

  return (
    <div>
      <div className="greeting-card">
        <div className="greeting-left">
          <div className="avatar-circle">{user.name.trim().charAt(0).toUpperCase()}</div>
          <div>
            <div className="greeting-name">Hola, {user.name.split(" ")[0]}</div>
            <div className="box-muted">{new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
        </div>
        {isCoach && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="icon-btn-circle" title="Importar desde Google Sheet" onClick={() => { goOwnPlan(); setShowImport((s) => !s); setShowForm(false); }}><Upload size={15} /></button>
            <button className="box-btn box-btn-primary" onClick={openNewForm}><Plus size={14} /> Nuevo WOD</button>
          </div>
        )}
      </div>

      <QuoteOfDay />

      {sources.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {sources.map((s) => (
            <button key={s.key} className={`box-tabbtn ${sourceKey === s.key ? "active" : ""}`} onClick={() => setSourceKey(s.key)}>{s.label}</button>
          ))}
        </div>
      )}

      <div className="stats-row">
        <StatChip icon={ClipboardList} value={wodsThisWeek} label="WODs esta semana" tint="amber" />
        <StatChip icon={CheckCircle2} value={totalNotes} label="Registros totales" tint="olive" />
        <StatChip icon={Dumbbell} value={rmCount} label="RM cargados" tint="rust" />
      </div>

      {showImport && canEdit && (
        <div className="box-card" style={{ marginBottom: 18 }}>
          <h3 className="box-h3" style={{ marginBottom: 8 }}>Importar desde Google Sheet (opcional)</h3>
          <p className="box-muted" style={{ marginBottom: 10 }}>
            Si ya tenés tu planificación armada en un Sheet: Archivo → Compartir → Publicar en la web → CSV → pegá el link acá.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="box-input" style={{ flex: 1, minWidth: 220 }} placeholder="https://docs.google.com/.../pub?output=csv" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
            <button className="box-btn box-btn-primary" onClick={doImport} disabled={importing}>{importing ? "Importando…" : "Importar"}</button>
            <button className="box-btn box-btn-ghost" onClick={() => setShowImport(false)}><X size={14} /></button>
          </div>
          {importErr && <div className="box-error">{importErr}</div>}
        </div>
      )}

      {showForm && canEdit && (
        <div className="box-card" style={{ marginBottom: 18 }}>
          <h3 className="box-h3" style={{ marginBottom: 10 }}>{editingId ? "Editar WOD" : "Nuevo WOD"}</h3>
          <TemplateBar
            coachId={user.id}
            kind="wod"
            getData={() => ({
              tipo: formTipo, movilidad: formMovilidad, core: formCore, skillType: formSkillType,
              skillContent: formSkillContent, estructura: formEstructura, wod: formWod, extraNotes: formExtra,
            })}
            onApply={(d) => {
              setFormTipo(d.tipo || "For Time");
              setFormMovilidad(d.movilidad || ""); setFormCore(d.core || "");
              setFormSkillType(d.skillType || "Gimnástico"); setFormSkillContent(d.skillContent || "");
              setFormEstructura(d.estructura || ""); setFormWod(d.wod || ""); setFormExtra(d.extraNotes || "");
            }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ width: 160 }}>
              <label className="box-label">Fecha *</label>
              <input className="box-input" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
          </div>

          <div className="box-field">
            <label className="box-label">¿Para quién es?</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <button type="button" className={`box-tabbtn ${formAudienceMode === "all" ? "active" : ""}`} onClick={() => setFormAudienceMode("all")}>Todos mis atletas</button>
              <button type="button" className={`box-tabbtn ${formAudienceMode === "some" ? "active" : ""}`} onClick={() => setFormAudienceMode("some")}>Atletas específicos</button>
            </div>
            {formAudienceMode === "some" && (
              myAthletes.length === 0 ? (
                <p className="box-muted">Todavía no tenés atletas vinculados.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", background: "var(--panel-2)", padding: 10, borderRadius: 10 }}>
                  {myAthletes.map((a) => {
                    const on = formAudience.includes(a.id);
                    return (
                      <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 2px" }}>
                        <input type="checkbox" checked={on}
                          onChange={() => setFormAudience((cur) => (on ? cur.filter((x) => x !== a.id) : [...cur, a.id]))} />
                        <span>{a.name}</span>
                      </label>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button type="button" className="box-btn box-btn-ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setFormAudience(myAthletes.map((a) => a.id))}>Marcar todos</button>
                    <button type="button" className="box-btn box-btn-ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setFormAudience([])}>Ninguno</button>
                  </div>
                </div>
              )
            )}
          </div>

          <div className="box-field">
            <label className="box-label">Movilidad (opcional)</label>
            <textarea className="box-input" rows={2} style={{ resize: "vertical", fontFamily: "'Barlow', sans-serif" }}
              placeholder="Ej: 5 min banda + hip openers" value={formMovilidad} onChange={(e) => setFormMovilidad(e.target.value)} />
          </div>

          <div className="box-field">
            <label className="box-label">Core (opcional)</label>
            <textarea className="box-input" rows={2} style={{ resize: "vertical", fontFamily: "'Barlow', sans-serif" }}
              placeholder="Ej: 3x15 hollow rocks" value={formCore} onChange={(e) => setFormCore(e.target.value)} />
          </div>

          <div className="box-field">
            <label className="box-label">Trabajo técnico (opcional)</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button type="button" className={`box-tabbtn ${formSkillType === "Gimnástico" ? "active" : ""}`} onClick={() => setFormSkillType("Gimnástico")}>Gimnástico</button>
              <button type="button" className={`box-tabbtn ${formSkillType === "Olímpico" ? "active" : ""}`} onClick={() => setFormSkillType("Olímpico")}>Olímpico</button>
              <button type="button" className={`box-tabbtn ${formSkillType === "Fuerza" ? "active" : ""}`} onClick={() => setFormSkillType("Fuerza")}>Fuerza</button>
            </div>
            <textarea className="box-input" rows={2} style={{ resize: "vertical", fontFamily: "'Barlow', sans-serif" }}
              placeholder={formSkillType === "Gimnástico" ? "Ej: 5x3 strict pull-ups" : formSkillType === "Olímpico" ? "Ej: 5x2 power snatch técnica" : "Ej: 5x5 Back Squat @ 75%"}
              value={formSkillContent} onChange={(e) => setFormSkillContent(e.target.value)} />
          </div>

          <div className="box-field">
            <label className="box-label">Estructura (opcional)</label>
            <textarea className="box-input" rows={2} style={{ resize: "vertical", fontFamily: "'Barlow', sans-serif" }}
              placeholder="Ej: 5x5 Back Squat @ 75%" value={formEstructura} onChange={(e) => setFormEstructura(e.target.value)} />
          </div>

          <div className="box-field">
            <label className="box-label">Tipo de WOD</label>
            <select className="box-select" style={{ width: 200 }} value={formTipo} onChange={(e) => setFormTipo(e.target.value)}>
              {WOD_TYPE_PRESETS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="box-field">
            <label className="box-label">WOD</label>
            <textarea className="box-input" rows={4} style={{ resize: "vertical", fontFamily: "'Barlow', sans-serif" }}
              placeholder={"Ej:\n21-15-9\nThrusters 40kg\nPull-ups"} value={formWod} onChange={(e) => setFormWod(e.target.value)} />
          </div>

          <div className="box-field">
            <label className="box-label">Nota extra (opcional)</label>
            <input className="box-input" value={formExtra} onChange={(e) => setFormExtra(e.target.value)} placeholder="ej: time cap 12 min" />
          </div>
          {formError && <div className="box-error" style={{ marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="box-btn box-btn-primary" onClick={submitForm} disabled={saving}><Check size={14} /> {saving ? "Guardando…" : "Guardar"}</button>
            <button className="box-btn box-btn-ghost" onClick={() => setShowForm(false)}><X size={14} /> Cancelar</button>
          </div>
        </div>
      )}

      <h1 className="box-h1" style={{ marginBottom: 14 }}>Planificación</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ width: 170 }}>
          <label className="box-label">Buscar por fecha</label>
          <input className="box-input" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </div>
        {filterDate && (
          <button className="box-btn box-btn-ghost" onClick={() => setFilterDate("")}>
            <X size={14} /> Ver todas las fechas
          </button>
        )}
      </div>

      <WeekStrip selectedDate={filterDate} onSelect={setFilterDate} markedDates={markedDates} />

      {comparingRow && (
        <div className="box-card" style={{ marginBottom: 18, borderLeft: "3px solid var(--amber)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 className="box-h3">Comparar: {comparingRow.tipo}</h3>
            <button className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={closeCompare}><X size={14} /></button>
          </div>
          {lineage === null ? (
            <p className="box-muted">Cargando…</p>
          ) : lineage.length < 2 ? (
            <p className="box-muted">Este WOD todavía no se repitió en otra fecha. Usá "Repetir" para volver a programarlo y poder comparar la evolución.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lineage.map((w, i) => {
                const best = w.myResults[0];
                const prev = i > 0 ? lineage[i - 1].myResults[0] : null;
                return (
                  <div className="rm-row" key={w.id}>
                    <div>
                      <b>{formatHuman(new Date(w.dateKey + "T00:00:00"))}</b>
                      {w.dateKey === comparingRow.dateKey && <span className="box-badge" style={{ marginLeft: 8 }}>Este</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {best ? (
                        <>
                          <div style={{ fontWeight: 700 }}>{formatResultValue(best)} <span className="box-muted" style={{ fontWeight: 400 }}>({best.scaling})</span></div>
                          {prev && prev.time && best.time && (
                            <div className="box-muted" style={{ fontSize: 11 }}>
                              {parseClockSeconds(best.time) != null && parseClockSeconds(prev.time) != null
                                ? (parseClockSeconds(best.time) < parseClockSeconds(prev.time) ? "más rápido que la vez anterior" : "más lento que la vez anterior")
                                : null}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="box-muted">Sin resultado anotado</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && <p className="box-muted">Cargando planificación…</p>}

      {!loading && filtered.length === 0 && (
        <div className="box-card">
          <p className="box-muted">
            {canEdit
              ? "Todavía no cargaste ningún WOD para esta fecha. Usá \"Nuevo WOD\" para crear el primero."
              : "Tu coach todavía no cargó ningún WOD para esta fecha."}
          </p>
        </div>
      )}

      <div className="whiteboard">
        {filtered.map((row) => {
          const isToday = row.dateKey === todayKey();
          const rowNotes = resultsByWod[row.id] || [];
          const WodIcon = wodIconFor(row.tipo);
          return (
            <div className="wod-row" key={row.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="wod-icon-circle"><WodIcon size={17} /></div>
                  <div>
                    <span className="wod-type">{row.tipo}</span>
                    {isToday && <span className="box-badge" style={{ marginLeft: 8, background: "var(--amber)", color: "#0a1412", borderLeft: "none" }}>HOY</span>}
                    {canEdit && row.audience && row.audience.length > 0 && (
                      <span className="box-badge" style={{ marginLeft: 8 }} title={myAthletes.filter((a) => row.audience.includes(a.id)).map((a) => a.name).join(", ")}>
                        Solo {row.audience.length} {row.audience.length === 1 ? "atleta" : "atletas"}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="box-muted">{formatHuman(row.date)}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={() => openCompare(row)} title="Comparar con otra fecha"><BarChart3 size={13} /></button>
                    {canEdit && (
                      <>
                        <button className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={() => { setRepeatingId(row.id); setRepeatDate(todayKey()); }} title="Repetir en otra fecha"><Repeat size={13} /></button>
                        <button className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={() => openEditForm(row)} title="Editar"><Pencil size={13} /></button>
                        {confirmDeleteId === row.id ? (
                          <>
                            <button className="box-btn box-btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => deleteWod(row.id)}>Sí, borrar</button>
                            <button className="box-btn box-btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                          </>
                        ) : (
                          <button className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={() => setConfirmDeleteId(row.id)} title="Borrar"><Trash2 size={13} /></button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {repeatingId === row.id && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-end", background: "var(--panel-2)", padding: 10 }}>
                  <div>
                    <label className="box-label">Repetir este WOD el</label>
                    <input className="box-input" type="date" value={repeatDate} onChange={(e) => setRepeatDate(e.target.value)} />
                  </div>
                  <button className="box-btn box-btn-primary" onClick={() => doRepeat(row)}><Check size={14} /> Repetir</button>
                  <button className="box-btn box-btn-ghost" onClick={() => setRepeatingId(null)}><X size={14} /></button>
                </div>
              )}

              {row.movilidad && <div className="wod-section"><span className="wod-section-label">Movilidad</span><div className="wod-desc">{row.movilidad}</div></div>}
              {row.core && <div className="wod-section"><span className="wod-section-label">Core</span><div className="wod-desc">{row.core}</div></div>}
              {row.skillContent && <div className="wod-section"><span className="wod-section-label">{row.skillType || "Técnico"}</span><div className="wod-desc">{row.skillContent}</div></div>}
              {row.estructura && <div className="wod-section"><span className="wod-section-label">Estructura</span><div className="wod-desc">{row.estructura}</div></div>}
              <div className="wod-section"><span className="wod-section-label">WOD</span><div className="wod-desc" style={{ fontWeight: 500 }}>{row.wod}</div></div>
              {row.extraNotes && <div className="box-muted" style={{ marginTop: 6 }}>Nota: {row.extraNotes}</div>}

              {rowNotes.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {rowNotes.map((n) => (
                    <div key={n.id} className="box-muted" style={{ background: "var(--panel-2)", padding: "8px 10px", borderRadius: 8 }}>
                      {n.completed && !n.time && n.rounds == null ? (
                        <b style={{ color: "var(--olive)", display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} /> Completado (sin resultado cargado)</b>
                      ) : (
                        <>
                          <b style={{ color: "var(--ink)" }}>{formatResultValue(n)}</b>{n.scaling ? <> · {n.scaling}</> : null}
                        </>
                      )}
                      {n.comment ? <div style={{ marginTop: 3 }}>{n.comment}</div> : null}
                      {(coachComments[n.id] || []).map((c) => (
                        <div key={c.id} style={{ marginTop: 6, padding: "6px 10px", background: "var(--amber-tint)", color: "var(--amber-ink)", borderRadius: 8, fontSize: 13 }}>
                          <b>{c.coachName}:</b> {c.body}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {openRow === row.id ? (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ width: 110 }}>
                      <label className="box-label">Tiempo</label>
                      <input className="box-input" placeholder="ej: 8:42" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
                    </div>
                    <div style={{ width: 90 }}>
                      <label className="box-label">Rondas</label>
                      <input className="box-input" type="number" placeholder="ej: 5" value={formRounds} onChange={(e) => setFormRounds(e.target.value)} />
                    </div>
                    <div style={{ width: 90 }}>
                      <label className="box-label">Reps extra</label>
                      <input className="box-input" type="number" placeholder="ej: 12" value={formReps} onChange={(e) => setFormReps(e.target.value)} />
                    </div>
                    <div style={{ width: 110 }}>
                      <label className="box-label">Modalidad</label>
                      <select className="box-select" value={formScaling} onChange={(e) => setFormScaling(e.target.value)}>
                        <option>RX</option>
                        <option>Scaled</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="box-label">Anotaciones</label>
                    <textarea className="box-input" rows={2} style={{ resize: "vertical", fontFamily: "'Barlow', sans-serif" }}
                      placeholder="cómo lo sentiste, técnica, sensaciones..." value={formComment} onChange={(e) => setFormComment(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="box-btn box-btn-primary" onClick={() => saveNote(row)}><Check size={14} /> Guardar</button>
                    <button className="box-btn box-btn-ghost" onClick={() => setOpenRow(null)}><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="box-btn box-btn-ghost" onClick={() => setOpenRow(row.id)}>
                    <Plus size={14} /> Anotar resultado
                  </button>
                  {rowNotes.some((n) => n.completed) ? (
                    <span className="box-badge" style={{ background: "var(--olive-tint)", color: "var(--olive)", borderLeftColor: "var(--olive)" }}>
                      <Check size={12} /> Completado
                    </span>
                  ) : (
                    <button className="box-btn box-btn-ghost" onClick={() => markComplete(row)} title="Para cuando entrenaste pero no hay resultado numérico para cargar">
                      <Check size={14} /> Marcar como completo
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== RM TRACKER ============================== */

function RmPercentCalculator({ exercises, byExercise }) {
  const withRecords = useMemo(() => exercises.filter((ex) => (byExercise[ex] || []).length > 0), [exercises, byExercise]);
  const [ex, setEx] = useState(withRecords[0] || "");
  const [pct, setPct] = useState(80);

  useEffect(() => {
    if (withRecords.length && !withRecords.includes(ex)) setEx(withRecords[0]);
  }, [withRecords, ex]);

  const best = useMemo(() => {
    const list = byExercise[ex] || [];
    if (!list.length) return null;
    return list.reduce((max, r) => (r.weight > max.weight ? r : max), list[0]);
  }, [byExercise, ex]);

  const result = best && pct !== "" ? Math.round(best.weight * (Number(pct) / 100) * 10) / 10 : null;

  return (
    <div className="box-card" style={{ marginBottom: 18 }}>
      <h2 className="box-h2" style={{ marginBottom: 8 }}>Calculadora de %</h2>
      {withRecords.length === 0 ? (
        <p className="box-muted">Cargá al menos un RM (arriba) para poder calcular porcentajes sobre él.</p>
      ) : (
        <>
          <p className="box-muted" style={{ marginBottom: 12 }}>
            Elegí el ejercicio y el % que te pide el WOD (ej: Back Squat al 80%) — calculamos el peso sobre tu mejor marca registrada.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label className="box-label">Ejercicio</label>
              <select className="box-select" value={ex} onChange={(e) => setEx(e.target.value)}>
                {withRecords.map((name) => <option key={name}>{name}</option>)}
              </select>
            </div>
            <div style={{ width: 100 }}>
              <label className="box-label">%</label>
              <input className="box-input" type="number" value={pct} onChange={(e) => setPct(e.target.value)} />
            </div>
          </div>
          {best && (
            <div className="stat-chip" style={{ marginTop: 14, display: "inline-flex" }}>
              <div className="stat-icon-circle" style={{ background: "var(--amber-tint)", color: "var(--amber-ink)" }}><Percent size={16} /></div>
              <div>
                <div className="stat-chip-value">{result != null ? `${result} ${best.unit}` : "—"}</div>
                <div className="stat-chip-label">{pct || 0}% de {best.weight}{best.unit} ({ex})</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MyPRsCard({ user, records }) {
  const [results, setResults] = useState(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { db.listMyResults(user.id).then(setResults).catch(() => setResults([])); }, [user.id]);

  const rmBests = useMemo(() => {
    const map = {};
    (records || []).forEach((r) => {
      const k = r.exercise + "|" + r.unit;
      if (!map[k] || r.weight > map[k].weight || (r.weight === map[k].weight && r.date > map[k].date)) map[k] = r;
    });
    return Object.values(map).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [records]);

  // WODs que se repitieron: mejor marca por WOD (separando RX y Scaled).
  const wodBests = useMemo(() => {
    const groups = {};
    (results || []).forEach((r) => {
      const sc = resultScore(r);
      if (!sc) return;
      const k = (r.originWodId || r.wodId) + "|" + (r.scaling || "") + "|" + sc.kind;
      (groups[k] = groups[k] || []).push({ r, sc });
    });
    return Object.values(groups)
      .filter((g) => g.length >= 2)
      .map((g) => {
        const best = g.reduce((b, x) => (isBetterScore(x.sc, b.sc) ? x : b), g[0]);
        return { best: best.r, count: g.length };
      })
      .sort((a, b) => (b.best.dateKey || "").localeCompare(a.best.dateKey || ""));
  }, [results]);

  if (!rmBests.length && !wodBests.length) return null;
  const rmShown = showAll ? rmBests : rmBests.slice(0, 5);
  const wodShown = showAll ? wodBests : wodBests.slice(0, 5);
  const hasMore = rmBests.length > 5 || wodBests.length > 5;

  return (
    <div className="box-card" style={{ marginBottom: 18, borderLeft: "3px solid var(--amber)" }}>
      <h2 className="box-h2" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}><Trophy size={18} /> Mis PRs</h2>
      {rmShown.length > 0 && (
        <>
          <div className="box-label" style={{ marginBottom: 4 }}>Levantamientos</div>
          {rmShown.map((r) => (
            <div className="rm-row" key={r.exercise + r.unit}>
              <div><b>{r.exercise}</b></div>
              <div style={{ textAlign: "right" }}>
                <b>{r.weight} {r.unit}</b>
                <div className="box-muted" style={{ fontSize: 11 }}>{r.date}</div>
              </div>
            </div>
          ))}
        </>
      )}
      {wodShown.length > 0 && (
        <>
          <div className="box-label" style={{ margin: "12px 0 4px" }}>WODs repetidos</div>
          {wodShown.map((w) => (
            <div className="rm-row" key={(w.best.originWodId || w.best.wodId) + w.best.scaling + w.best.id}>
              <div style={{ minWidth: 0 }}>
                <b>{w.best.tipo}</b>
                <div className="box-muted" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                  {(w.best.wod || "").split("\n")[0]}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <b>{formatResultValue(w.best)}</b>
                <div className="box-muted" style={{ fontSize: 11 }}>{w.best.scaling} · {w.count} veces</div>
              </div>
            </div>
          ))}
        </>
      )}
      {hasMore && (
        <button className="box-btn box-btn-ghost" style={{ marginTop: 10, padding: "5px 10px", fontSize: 12 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Ver menos" : "Ver todos"}
        </button>
      )}
    </div>
  );
}

function RmTracker({ user }) {
  const [records, setRecords] = useState(null);
  const [customExercises, setCustomExercises] = useState([]);
  const [selected, setSelected] = useState(DEFAULT_EXERCISES[0]);
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState(defaultUnitFor(DEFAULT_EXERCISES[0]));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [customEx, setCustomEx] = useState("");

  const reload = useCallback(() => {
    db.listRmRecords(user.id).then(setRecords);
    db.listCustomExercises(user.id).then(setCustomExercises);
  }, [user.id]);

  useEffect(() => { reload(); }, [reload]);

  const extraExercises = useMemo(
    () => customExercises.filter((ex) => !DEFAULT_EXERCISES.includes(ex)),
    [customExercises]
  );
  const exercises = useMemo(() => [...DEFAULT_EXERCISES, ...extraExercises], [extraExercises]);

  const selectExercise = (ex) => {
    setSelected(ex);
    setUnit(defaultUnitFor(ex));
  };

  const addRecord = async () => {
    if (!weight) return;
    await checkRmPR(user.id, selected, weight, unit);
    await db.addRmRecord(user.id, { exercise: selected, weight: Number(weight), unit, date, note });
    reload();
    setWeight(""); setNote("");
  };

  const removeRecord = async (id) => {
    await db.deleteRmRecord(id);
    reload();
  };

  const addCustomExercise = async () => {
    const name = customEx.trim();
    if (!name) return;
    if (!exercises.includes(name)) {
      await db.addCustomExercise(user.id, name);
      reload();
    }
    selectExercise(name);
    setCustomEx("");
  };

  const byExercise = useMemo(() => {
    const map = {};
    (records || []).forEach((r) => {
      map[r.exercise] = map[r.exercise] || [];
      map[r.exercise].push(r);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => new Date(a.date) - new Date(b.date)));
    return map;
  }, [records]);

  const currentMax = useMemo(() => {
    const list = byExercise[selected] || [];
    return list.length ? Math.max(...list.map((r) => r.weight)) : null;
  }, [byExercise, selected]);

  const isNewPR = weight && currentMax !== null && Number(weight) > currentMax;

  const chartData = (byExercise[selected] || []).map((r) => ({ date: r.date.slice(5), weight: r.weight }));

  if (records === null) return <p className="box-muted">Cargando…</p>;

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Récords (RM)</h1>

      <div className="box-card" style={{ marginBottom: 18 }}>
        <h2 className="box-h2" style={{ marginBottom: 12 }}>Registrar nuevo RM</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label className="box-label">Ejercicio</label>
            <select className="box-select" value={selected} onChange={(e) => selectExercise(e.target.value)}>
              <optgroup label="Fuerza">
                {STRENGTH_EXERCISES.map((ex) => <option key={ex}>{ex}</option>)}
              </optgroup>
              <optgroup label="Gimnástico / Skill">
                {SKILL_EXERCISES.map((ex) => <option key={ex}>{ex}</option>)}
              </optgroup>
              {extraExercises.length > 0 && (
                <optgroup label="Personalizados">
                  {extraExercises.map((ex) => <option key={ex}>{ex}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div style={{ width: 100 }}>
            <label className="box-label">{unit === "reps" ? "Repeticiones" : unit === "m" ? "Distancia" : "Peso"}</label>
            <input className="box-input" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div style={{ width: 90 }}>
            <label className="box-label">Unidad</label>
            <select className="box-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
              <option value="reps">reps</option>
              <option value="m">m</option>
            </select>
          </div>
          <div style={{ width: 150 }}>
            <label className="box-label">Fecha</label>
            <input className="box-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label className="box-label">Nota (opcional)</label>
            <input className="box-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="sensaciones, técnica…" />
          </div>
        </div>
        {isNewPR && <div className="box-badge" style={{ marginTop: 10 }}><Flame size={12} /> Nuevo PR</div>}
        <button className="box-btn box-btn-primary" style={{ marginTop: 14 }} onClick={addRecord}><Plus size={14} /> Guardar</button>

        <div className="box-divider" />
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="box-label">Agregar ejercicio propio</label>
            <input className="box-input" value={customEx} onChange={(e) => setCustomEx(e.target.value)} placeholder="ej: Split Jerk" />
          </div>
          <button className="box-btn box-btn-ghost" onClick={addCustomExercise}>Agregar</button>
        </div>
      </div>

      <MyPRsCard user={user} records={records} />

      <RmPercentCalculator exercises={exercises} byExercise={byExercise} />

      <div className="box-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 className="box-h2">{selected}</h2>
          {currentMax !== null && (
            <div className="stat-chip" style={{ flex: "0 0 auto" }}>
              <div className="stat-icon-circle" style={{ background: "var(--amber-tint)", color: "var(--amber-ink)" }}><TrendingUp size={16} /></div>
              <div>
                <div className="stat-chip-value">{currentMax} {unit}</div>
                <div className="stat-chip-label">Mejor marca</div>
              </div>
            </div>
          )}
        </div>
        {(byExercise[selected] || []).length >= 2 ? (
          <div style={{ height: 220, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--ink-dim)" fontSize={11} />
                <YAxis stroke="var(--ink-dim)" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} />
                <Line type="monotone" dataKey="weight" stroke="var(--amber)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="box-muted" style={{ marginTop: 10 }}>Cargá al menos dos marcas para ver la evolución en gráfico.</p>
        )}

        <div className="box-divider" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 className="box-h3">Histórico</h3>
          {records.length > 0 && (
            <button className="box-btn box-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
              onClick={() => downloadCSV(`rm-${user.username}.csv`, records, ["exercise", "weight", "unit", "date", "note"])}>
              <Download size={13} /> Exportar todo
            </button>
          )}
        </div>
        {(byExercise[selected] || []).slice().reverse().map((r) => (
          <div className="rm-row" key={r.id}>
            <div>
              <b>{r.weight} {r.unit}</b>
              <span className="box-muted" style={{ marginLeft: 8 }}>{r.date}</span>
              {r.note && <div className="box-muted">{r.note}</div>}
            </div>
            <button onClick={() => removeRecord(r.id)} style={{ background: "none", border: "none", color: "var(--ink-dim)", cursor: "pointer" }}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {(byExercise[selected] || []).length === 0 && <p className="box-muted">Todavía no cargaste marcas para este ejercicio.</p>}
      </div>
    </div>
  );
}

/* ============================== TIMER ============================== */

const TIMER_MODES = [
  { id: "fortime", label: "For Time" },
  { id: "emom", label: "OTM / EMOM" },
  { id: "amrap", label: "AMRAP" },
  { id: "tabata", label: "Tabata" },
];

function useTicker(active, onTick, intervalMs = 100) {
  const ref = useRef();
  useEffect(() => {
    if (!active) return;
    ref.current = setInterval(onTick, intervalMs);
    return () => clearInterval(ref.current);
  }, [active, onTick, intervalMs]);
}

function usePreStartCountdown(seconds = 3) {
  const [count, setCount] = useState(null);
  const onGoRef = useRef(null);

  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      beep(1046, 300, "square", 0.3);
      const t = setTimeout(() => {
        setCount(null);
        onGoRef.current && onGoRef.current();
      }, 250);
      return () => clearTimeout(t);
    }
    beep(660, 150, "sine");
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  const start = (onGo) => {
    onGoRef.current = onGo;
    setCount(seconds);
  };

  return { counting: count !== null, count, start };
}

function CountdownOverlay({ count }) {
  return (
    <div className="clock-display" style={{ color: "var(--amber)" }}>
      {count === 0 ? "GO" : count}
    </div>
  );
}

function LinkResultToWod({ user, kind, value, onDone, onCancel }) {
  const [wods, setWods] = useState(null);
  const [wodId, setWodId] = useState("");
  const [time, setTime] = useState(kind === "time" ? value : "");
  const [rounds, setRounds] = useState(kind === "rounds" ? String(value) : "");
  const [reps, setReps] = useState("");
  const [scaling, setScaling] = useState("RX");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const coachIds = [];
      if (user.role === "coach") coachIds.push(user.id);
      (user.coaches || []).forEach((c) => { if (c.id) coachIds.push(c.id); });
      if (coachIds.length === 0) { setWods([]); return; }
      const lists = await Promise.all(coachIds.map((id) => db.listWods(id)));
      const merged = lists.map((l, i) => l.map((w) => ({ ...w, _coachId: coachIds[i] }))).flat();
      const sorted = merged.slice().sort((a, b) => (b.dateKey || "").localeCompare(a.dateKey || "")).slice(0, 30);
      setWods(sorted);
      const today = todayKey();
      const todays = sorted.find((w) => w.dateKey === today);
      setWodId(todays ? todays.id : (sorted[0]?.id || ""));
    })();
  }, [user]);

  const save = async () => {
    if (!wodId) { setErr("No hay ningún WOD para vincular todavía."); return; }
    setSaving(true);
    try {
      const saved = await db.addResult({
        wodId, userId: user.id, time: time || null, rounds: rounds ? Number(rounds) : null,
        reps: reps ? Number(reps) : null, scaling, comment,
      });
      const picked = (wods || []).find((w) => w.id === wodId);
      if (picked) checkWodPR({ wod: picked, coachId: picked._coachId, userId: user.id, saved });
      setSaving(false);
      onDone();
    } catch (e) {
      setErr(e.message || "No pudimos guardar el resultado.");
      setSaving(false);
    }
  };

  if (wods === null) return <p className="box-muted">Cargando WODs…</p>;

  if (wods.length === 0) {
    return (
      <div className="box-card">
        <p className="box-muted">
          {user.role === "coach" || (user.coaches || []).length > 0 ? "Todavía no hay ningún WOD cargado para vincular este resultado." : "Vinculate con un coach (en Ajustes) para poder guardar resultados en un WOD."}
        </p>
        <button className="box-btn box-btn-ghost" style={{ marginTop: 10 }} onClick={onCancel}>Cerrar</button>
      </div>
    );
  }

  return (
    <div className="box-card">
      <h3 className="box-h3" style={{ marginBottom: 10 }}>Guardar {kind === "rounds" ? `${value} rondas` : value} en un WOD</h3>
      <div className="box-field">
        <label className="box-label">WOD</label>
        <select className="box-select" value={wodId} onChange={(e) => setWodId(e.target.value)}>
          {wods.map((w) => (
            <option key={w.id} value={w.id}>{w.dateKey} · {w.tipo}{w.dateKey === todayKey() ? " (hoy)" : ""}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ width: 100 }}>
          <label className="box-label">Tiempo</label>
          <input className="box-input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="ej: 8:42" />
        </div>
        <div style={{ width: 90 }}>
          <label className="box-label">Rondas</label>
          <input className="box-input" type="number" value={rounds} onChange={(e) => setRounds(e.target.value)} placeholder="ej: 5" />
        </div>
        <div style={{ width: 90 }}>
          <label className="box-label">Reps extra</label>
          <input className="box-input" type="number" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="ej: 12" />
        </div>
        <div style={{ width: 130 }}>
          <label className="box-label">Modalidad</label>
          <select className="box-select" value={scaling} onChange={(e) => setScaling(e.target.value)}>
            <option>RX</option>
            <option>Scaled</option>
          </select>
        </div>
      </div>
      <div className="box-field">
        <label className="box-label">Anotaciones (opcional)</label>
        <textarea className="box-input" rows={2} style={{ resize: "vertical", fontFamily: "'Barlow', sans-serif" }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="cómo lo sentiste" />
      </div>
      {err && <div className="box-error">{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="box-btn box-btn-primary" onClick={save} disabled={saving}><Check size={14} /> {saving ? "Guardando…" : "Guardar"}</button>
        <button className="box-btn box-btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function IntField({ value, onChange, width = 70, disabled, placeholder, allowEmpty = false }) {
  const sanitize = (raw) => {
    let v = raw.replace(/[^\d]/g, "");
    v = v.replace(/^0+(?=\d)/, "");
    return v;
  };
  return (
    <input
      className="box-input"
      style={{ width }}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(sanitize(e.target.value))}
      onBlur={() => { if (value === "" && !allowEmpty) onChange("0"); }}
    />
  );
}

function ForTimeTimer({ user }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [capStr, setCapStr] = useState("");
  const cap = Number(capStr) || 0;
  const [showLink, setShowLink] = useState(false);
  const startRef = useRef(null);
  const capHitRef = useRef(false);
  const lastWarnRef = useRef(null);
  const pre = usePreStartCountdown(3);
  useWakeLock(running || pre.counting);

  useTicker(running, () => {
    const now = Date.now();
    const secs = (now - startRef.current) / 1000;
    setElapsed(secs);
    const capSec = Number(cap) * 60;
    if (cap) {
      const remToCap = Math.ceil(capSec - secs);
      if (remToCap <= 10 && remToCap > 0 && remToCap !== lastWarnRef.current) {
        lastWarnRef.current = remToCap;
        beep(520, 100, "sine");
      }
      if (!capHitRef.current && secs >= capSec) {
        capHitRef.current = true;
        beep(660, 500, "square");
      }
    }
  });

  const reallyStart = () => {
    startRef.current = Date.now() - elapsed * 1000;
    capHitRef.current = false;
    lastWarnRef.current = null;
    setRunning(true);
    beep(880, 150);
  };
  const start = () => { primeAudio(); elapsed > 0 ? reallyStart() : pre.start(reallyStart); };
  const pause = () => { setRunning(false); };
  const reset = () => { setRunning(false); setElapsed(0); capHitRef.current = false; lastWarnRef.current = null; setShowLink(false); };

  return (
    <div className="box-card">
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 140 }}>
          <label className="box-label">Time cap (min, opcional)</label>
          <IntField value={capStr} onChange={setCapStr} disabled={running || pre.counting} allowEmpty />
        </div>
      </div>
      {pre.counting ? (
        <CountdownOverlay count={pre.count} />
      ) : cap ? (
        <ProgressRing
          fraction={elapsed / (Number(cap) * 60)}
          color={elapsed >= Number(cap) * 60 ? "var(--rust)" : "var(--amber)"}
        >
          <div className="clock-display" style={{ fontSize: 52, color: elapsed >= Number(cap) * 60 ? "var(--rust)" : "var(--ink)" }}>
            {fmtClock(elapsed)}
          </div>
        </ProgressRing>
      ) : (
        <div className="clock-display">{fmtClock(elapsed)}</div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
        {!running ? <button className="box-btn box-btn-primary" onClick={start} disabled={pre.counting}>{elapsed > 0 ? "Reanudar" : "Start"}</button> : <button className="box-btn box-btn-ghost" onClick={pause}>Pausar</button>}
        <button className="box-btn box-btn-ghost" onClick={reset} disabled={pre.counting}>Reset</button>
        {!running && elapsed > 0 && !showLink && (
          <button className="box-btn box-btn-primary" onClick={() => setShowLink(true)}><Link2 size={14} /> Guardar en un WOD</button>
        )}
      </div>
      {showLink && (
        <div style={{ marginTop: 14 }}>
          <LinkResultToWod user={user} kind="time" value={fmtClock(elapsed)} onDone={() => setShowLink(false)} onCancel={() => setShowLink(false)} />
        </div>
      )}
    </div>
  );
}

function EmomTimer() {
  const [running, setRunning] = useState(false);
  const [workMinStr, setWorkMinStr] = useState("1");
  const [workSecStr, setWorkSecStr] = useState("0");
  const [noRest, setNoRest] = useState(true);
  const [restMinStr, setRestMinStr] = useState("0");
  const [restSecStr, setRestSecStr] = useState("30");
  const [roundsStr, setRoundsStr] = useState("10");
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState("work");
  const [remaining, setRemaining] = useState(60);
  const startRef = useRef(null);
  const lastPhaseKeyRef = useRef(null);
  const lastWarnRef = useRef(null);
  const pre = usePreStartCountdown(3);
  useWakeLock(running || pre.counting);

  const work = Math.max(1, (Number(workMinStr) || 0) * 60 + (Number(workSecStr) || 0));
  const rest = noRest ? 0 : Math.max(0, (Number(restMinStr) || 0) * 60 + (Number(restSecStr) || 0));
  const rounds = Math.max(1, Number(roundsStr) || 0);
  const cycle = work + rest;

  useTicker(running, () => {
    const elapsed = (Date.now() - startRef.current) / 1000;
    const currentRound = Math.min(rounds, Math.floor(elapsed / cycle) + 1);
    const posInCycle = elapsed % cycle;
    const isWork = posInCycle < work;
    const remInPhase = isWork ? work - posInCycle : cycle - posInCycle;
    const key = `${currentRound}-${isWork ? "w" : "r"}`;
    if (key !== lastPhaseKeyRef.current) {
      lastPhaseKeyRef.current = key;
      lastWarnRef.current = null;
      beep(isWork ? 880 : 440, 200, "square");
    }
    const remRounded = Math.ceil(remInPhase);
    if (remRounded <= 10 && remRounded > 0 && remRounded !== lastWarnRef.current) {
      lastWarnRef.current = remRounded;
      beep(520, 100, "sine");
    }
    if (elapsed >= rounds * cycle) {
      setRound(rounds);
      setPhase("work");
      setRemaining(0);
      setRunning(false);
      beep(660, 700, "square");
      return;
    }
    setRound(currentRound);
    setPhase(isWork ? "work" : "rest");
    setRemaining(remInPhase);
  });

  const reallyStart = () => {
    startRef.current = Date.now();
    lastPhaseKeyRef.current = null;
    lastWarnRef.current = null;
    setRound(1);
    setPhase("work");
    setRemaining(work);
    setRunning(true);
    beep(880, 200, "square");
  };
  const start = () => { primeAudio(); pre.start(reallyStart); };
  const stop = () => setRunning(false);
  const reset = () => { setRunning(false); setRound(1); setPhase("work"); setRemaining(work); };

  return (
    <div className="box-card">
      <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <label className="box-label">Trabajo</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <IntField width={56} value={workMinStr} onChange={setWorkMinStr} disabled={running || pre.counting} />
            <span className="box-muted" style={{ fontSize: 12 }}>min</span>
            <IntField width={56} value={workSecStr} onChange={setWorkSecStr} disabled={running || pre.counting} />
            <span className="box-muted" style={{ fontSize: 12 }}>seg</span>
          </div>
        </div>
        <div>
          <label className="box-label" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Descanso
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 12, color: "var(--ink-dim)" }}>
              <input type="checkbox" checked={noRest} onChange={(e) => setNoRest(e.target.checked)} disabled={running || pre.counting} /> Sin descanso
            </span>
          </label>
          {!noRest && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <IntField width={56} value={restMinStr} onChange={setRestMinStr} disabled={running || pre.counting} />
              <span className="box-muted" style={{ fontSize: 12 }}>min</span>
              <IntField width={56} value={restSecStr} onChange={setRestSecStr} disabled={running || pre.counting} />
              <span className="box-muted" style={{ fontSize: 12 }}>seg</span>
            </div>
          )}
        </div>
        <div style={{ width: 90 }}>
          <label className="box-label">Rondas</label>
          <IntField value={roundsStr} onChange={setRoundsStr} disabled={running || pre.counting} />
        </div>
      </div>
      <p className="box-muted" style={{ textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {!noRest && `${phase === "work" ? "Trabajo" : "Descanso"} · `}Ronda {round}/{rounds}
      </p>
      {pre.counting ? (
        <CountdownOverlay count={pre.count} />
      ) : (
        <ProgressRing
          fraction={phase === "work" ? (work - remaining) / work : rest ? (rest - remaining) / rest : 1}
          color={phase === "work" ? "var(--amber)" : "var(--ink-dim)"}
        >
          <div className="clock-display" style={{ fontSize: 52, color: phase === "work" ? "var(--amber)" : "var(--ink-dim)" }}>{fmtClock(remaining)}</div>
        </ProgressRing>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
        {!running ? <button className="box-btn box-btn-primary" onClick={start} disabled={pre.counting}>Start</button> : <button className="box-btn box-btn-ghost" onClick={stop}>Pausar</button>}
        <button className="box-btn box-btn-ghost" onClick={reset} disabled={pre.counting}>Reset</button>
      </div>
    </div>
  );
}

function AmrapTimer({ user }) {
  const [running, setRunning] = useState(false);
  const [minutesStr, setMinutesStr] = useState("15");
  const minutes = Number(minutesStr) || 0;
  const [remaining, setRemaining] = useState(15 * 60);
  const [rounds, setRounds] = useState(0);
  const [showLink, setShowLink] = useState(false);
  const startRef = useRef(null);
  const doneRef = useRef(false);
  const lastWarnRef = useRef(null);
  const pre = usePreStartCountdown(3);
  useWakeLock(running || pre.counting);

  useTicker(running, () => {
    const elapsed = (Date.now() - startRef.current) / 1000;
    const rem = minutes * 60 - elapsed;
    setRemaining(rem);
    const remRounded = Math.ceil(rem);
    if (remRounded <= 10 && remRounded > 0 && remRounded !== lastWarnRef.current) {
      lastWarnRef.current = remRounded;
      beep(520, 100, "sine");
    }
    if (rem <= 0 && !doneRef.current) {
      doneRef.current = true;
      beep(660, 700, "square");
      setRunning(false);
    }
  });

  const reallyStart = () => {
    startRef.current = Date.now() - (minutes * 60 - remaining) * 1000;
    doneRef.current = false;
    lastWarnRef.current = null;
    setRunning(true);
    beep(880, 200);
  };
  const start = () => { primeAudio(); pre.start(reallyStart); };
  const pause = () => setRunning(false);
  const reset = () => { setRunning(false); setRemaining(minutes * 60); setRounds(0); doneRef.current = false; lastWarnRef.current = null; setShowLink(false); };

  return (
    <div className="box-card">
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 140 }}>
          <label className="box-label">Duración (min)</label>
          <IntField value={minutesStr} onChange={(v) => { setMinutesStr(v); setRemaining((Number(v) || 0) * 60); }} disabled={running || pre.counting} />
        </div>
      </div>
      {pre.counting ? (
        <CountdownOverlay count={pre.count} />
      ) : (
        <ProgressRing fraction={(minutes * 60 - remaining) / (minutes * 60)} color={remaining <= 10 && remaining > 0 ? "var(--rust)" : "var(--amber)"}>
          <div className="clock-display" style={{ fontSize: 52, color: remaining <= 10 && remaining > 0 ? "var(--rust)" : "var(--ink)" }}>{fmtClock(remaining)}</div>
        </ProgressRing>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 12 }}>
        <button className="box-btn box-btn-ghost" onClick={() => setRounds((r) => Math.max(0, r - 1))}>-</button>
        <span className="box-h2">{rounds} rondas</span>
        <button className="box-btn box-btn-ghost" onClick={() => setRounds((r) => r + 1)}>+</button>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
        {!running ? <button className="box-btn box-btn-primary" onClick={start} disabled={pre.counting}>Start</button> : <button className="box-btn box-btn-ghost" onClick={pause}>Pausar</button>}
        <button className="box-btn box-btn-ghost" onClick={reset} disabled={pre.counting}>Reset</button>
        {!running && rounds > 0 && !showLink && (
          <button className="box-btn box-btn-primary" onClick={() => setShowLink(true)}><Link2 size={14} /> Guardar en un WOD</button>
        )}
      </div>
      {showLink && (
        <div style={{ marginTop: 14 }}>
          <LinkResultToWod user={user} kind="rounds" value={rounds} onDone={() => setShowLink(false)} onCancel={() => setShowLink(false)} />
        </div>
      )}
    </div>
  );
}

function TabataTimer() {
  const [running, setRunning] = useState(false);
  const [workStr, setWorkStr] = useState("20");
  const [restStr, setRestStr] = useState("10");
  const [totalStr, setTotalStr] = useState("8");
  const work = Math.max(1, Number(workStr) || 0);
  const rest = Math.max(0, Number(restStr) || 0);
  const total = Math.max(1, Number(totalStr) || 0);
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState("work");
  const [remaining, setRemaining] = useState(20);
  const startRef = useRef(null);
  const lastPhaseKeyRef = useRef(null);
  const lastWarnRef = useRef(null);
  const pre = usePreStartCountdown(3);
  useWakeLock(running || pre.counting);

  const cycle = work + rest;

  useTicker(running, () => {
    const elapsed = (Date.now() - startRef.current) / 1000;
    const currentRound = Math.min(total, Math.floor(elapsed / cycle) + 1);
    const posInCycle = elapsed % cycle;
    const isWork = posInCycle < work;
    const remInPhase = isWork ? work - posInCycle : cycle - posInCycle;
    const key = `${currentRound}-${isWork ? "w" : "r"}`;
    if (key !== lastPhaseKeyRef.current) {
      lastPhaseKeyRef.current = key;
      lastWarnRef.current = null;
      beep(isWork ? 880 : 440, 200, "square");
    }
    const remRounded = Math.ceil(remInPhase);
    if (remRounded <= 10 && remRounded > 0 && remRounded !== lastWarnRef.current) {
      lastWarnRef.current = remRounded;
      beep(520, 100, "sine");
    }
    setRound(currentRound);
    setPhase(isWork ? "work" : "rest");
    setRemaining(remInPhase);
    if (elapsed >= total * cycle) {
      setRunning(false);
      beep(660, 700, "square");
    }
  });

  const reallyStart = () => {
    startRef.current = Date.now();
    lastPhaseKeyRef.current = null;
    lastWarnRef.current = null;
    setRound(1);
    setPhase("work");
    setRemaining(work);
    setRunning(true);
    beep(880, 200, "square");
  };
  const start = () => { primeAudio(); pre.start(reallyStart); };
  const stop = () => setRunning(false);
  const reset = () => { setRunning(false); setRound(1); setPhase("work"); setRemaining(work); };

  return (
    <div className="box-card">
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ width: 100 }}>
          <label className="box-label">Trabajo (s)</label>
          <IntField value={workStr} onChange={setWorkStr} disabled={running || pre.counting} />
        </div>
        <div style={{ width: 100 }}>
          <label className="box-label">Descanso (s)</label>
          <IntField value={restStr} onChange={setRestStr} disabled={running || pre.counting} />
        </div>
        <div style={{ width: 100 }}>
          <label className="box-label">Rondas</label>
          <IntField value={totalStr} onChange={setTotalStr} disabled={running || pre.counting} />
        </div>
      </div>
      <p className="box-muted" style={{ textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {phase === "work" ? "Trabajo" : "Descanso"} · Ronda {round}/{total}
      </p>
      {pre.counting ? (
        <CountdownOverlay count={pre.count} />
      ) : (
        <ProgressRing
          fraction={phase === "work" ? (work - remaining) / work : (rest - remaining) / rest}
          color={phase === "work" ? "var(--amber)" : "var(--ink-dim)"}
        >
          <div className="clock-display" style={{ fontSize: 52, color: phase === "work" ? "var(--amber)" : "var(--ink-dim)" }}>{fmtClock(remaining)}</div>
        </ProgressRing>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
        {!running ? <button className="box-btn box-btn-primary" onClick={start} disabled={pre.counting}>Start</button> : <button className="box-btn box-btn-ghost" onClick={stop}>Pausar</button>}
        <button className="box-btn box-btn-ghost" onClick={reset} disabled={pre.counting}>Reset</button>
      </div>
    </div>
  );
}

function TimerScreen({ user }) {
  const [mode, setMode] = useState("fortime");
  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Cronómetro</h1>
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {TIMER_MODES.map((m) => (
          <button key={m.id} className={`box-tabbtn ${mode === m.id ? "active" : ""}`} style={{ flex: "1 1 100px" }} onClick={() => setMode(m.id)}>{m.label}</button>
        ))}
      </div>
      {mode === "fortime" && <ForTimeTimer user={user} />}
      {mode === "emom" && <EmomTimer />}
      {mode === "amrap" && <AmrapTimer user={user} />}
      {mode === "tabata" && <TabataTimer />}
    </div>
  );
}

/* ============================== SETTINGS ============================== */

function SettingsScreen({ user, onLogout, onUserUpdate, onCoachesReload }) {
  const [showPolicy, setShowPolicy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const coaches = user.coaches || [];

  const unlink = async (coachUsername) => {
    await db.unlinkCoach(user.id, coachUsername);
    onCoachesReload();
  };

  const becomeCoach = async () => {
    await db.becomeCoach(user.id);
    onUserUpdate({ role: "coach" });
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await db.deleteMyAccount(user.id);
      onLogout();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Ajustes</h1>

      {user.role === "atleta" && (
        <div className="box-card" style={{ marginBottom: 18 }}>
          <h2 className="box-h2" style={{ marginBottom: 8 }}>¿Querés armar tu propio grupo?</h2>
          <p className="box-muted" style={{ marginBottom: 10 }}>
            Podés pasar a ser coach cuando quieras. No perdés nada de lo que ya cargaste, y además vas a poder armar tu propia planificación y tener atletas propios.
          </p>
          <button className="box-btn box-btn-primary" onClick={becomeCoach}><Users size={14} /> Convertirme en coach</button>
        </div>
      )}

      {user.role === "coach" && (
        <div className="box-card" style={{ marginBottom: 18 }}>
          <h2 className="box-h2" style={{ marginBottom: 8 }}>Tu código para atletas</h2>
          <p className="box-muted" style={{ marginBottom: 10 }}>Compartí este usuario con tus atletas para que se vinculen con vos desde sus Ajustes. La planificación la cargás desde la pestaña <b>WOD</b>.</p>
          <div style={{ background: "var(--panel-2)", border: "1px solid var(--amber)", padding: "10px 14px", fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: "0.03em", display: "inline-flex", alignItems: "center", gap: 8, color: "var(--amber)", borderRadius: "var(--radius)" }}>
            <Users size={16} color="var(--amber)" /> {user.username}
          </div>
        </div>
      )}

      <div className="box-card" style={{ marginBottom: 18 }}>
        <h2 className="box-h2" style={{ marginBottom: 8 }}>Tus coaches</h2>
        {user.role === "coach" && (
          <p className="box-muted" style={{ marginBottom: 10 }}>¿Vos también entrenás con uno o más coaches? Vinculate con cada uno y vas a poder alternar entre sus planes desde la pestaña WOD.</p>
        )}
        {coaches.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {coaches.map((c) => (
              <div className="rm-row" key={c.username}>
                <span>{c.name} <span className="box-muted">({c.username})</span></span>
                <button className="box-btn box-btn-danger" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => unlink(c.username)}><Unlink2 size={13} /> Desvincular</button>
              </div>
            ))}
          </div>
        )}
        <LinkCoachForm user={user} onLinked={onCoachesReload} compact />
      </div>

      <div className="box-card" style={{ marginBottom: 18 }}>
        <h2 className="box-h2" style={{ marginBottom: 8 }}>Sesión</h2>
        <p className="box-muted" style={{ marginBottom: 12 }}>
          Conectado como <b style={{ color: "var(--ink)" }}>{user.name}</b> ({user.username}) · {user.role === "coach" ? "Coach" : "Atleta"}
          {user.email && <><br />{user.email}</>}
        </p>
        <button className="box-btn box-btn-danger" onClick={onLogout}><LogOut size={14} /> Cerrar sesión</button>
      </div>

      <div className="box-card" style={{ marginBottom: 18 }}>
        <h2 className="box-h2" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={16} color="var(--amber)" /> Privacidad y seguridad
        </h2>
        {showPolicy ? (
          <>
            <PrivacyPolicyText />
            <button className="box-btn box-btn-ghost" style={{ marginTop: 14 }} onClick={() => setShowPolicy(false)}>Cerrar</button>
          </>
        ) : (
          <>
            <p className="box-muted" style={{ marginBottom: 10 }}>
              El login corre sobre Supabase Auth, con las mismas garantías de seguridad que usan miles de aplicaciones en producción.
            </p>
            <button className="box-btn box-btn-ghost" onClick={() => setShowPolicy(true)}>Ver política de privacidad</button>
          </>
        )}
      </div>

      <div className="box-card" style={{ borderColor: "var(--rust)" }}>
        <h2 className="box-h2" style={{ marginBottom: 8 }}>Eliminar cuenta</h2>
        <p className="box-muted" style={{ marginBottom: 12 }}>
          Borra tu perfil, tus RM, tus resultados y tu planificación de forma permanente.
          {user.role === "coach" && " Tus atletas quedan automáticamente desvinculados."}
        </p>
        {confirmDelete ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="box-muted">¿Seguro? No se puede deshacer.</span>
            <button className="box-btn box-btn-danger" onClick={deleteAccount} disabled={deleting}>{deleting ? "Eliminando…" : "Sí, eliminar todo"}</button>
            <button className="box-btn box-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
          </div>
        ) : (
          <button className="box-btn box-btn-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Eliminar mi cuenta</button>
        )}
      </div>
    </div>
  );
}

/* ============================== COACH: ATLETAS ============================== */

// Resume la actividad de un atleta (WODs, rutinas, Hyrox) para el panel y la ficha del coach.
function summarizeActivity(act) {
  const today = todayKey();
  const dateSet = new Set();
  const todayItems = [];
  ((act && act.results) || []).forEach((r) => {
    const keys = [r.savedAt ? toKey(new Date(r.savedAt)) : null, r.dateKey].filter(Boolean);
    keys.forEach((k) => dateSet.add(k));
    if (keys.includes(today)) {
      const hasValue = r.time || (r.rounds != null && r.rounds !== "");
      todayItems.push(`${r.tipo || "WOD"}${hasValue ? ` · ${formatResultValue(r)}` : " · completado"}${r.scaling ? ` (${r.scaling})` : ""}`);
    }
  });
  let routineToday = false;
  ((act && act.completions) || []).forEach((c) => { dateSet.add(c.dateKey); if (c.dateKey === today) routineToday = true; });
  if (routineToday) todayItems.push("Rutina del día completada");
  let hyroxToday = false;
  ((act && act.hyrox) || []).forEach((h) => {
    const k = toKey(new Date(h.createdAt));
    dateSet.add(k);
    if (k === today) hyroxToday = true;
  });
  if (hyroxToday) todayItems.push("Simulacro Hyrox");
  const dateKeys = Array.from(dateSet).filter((k) => k <= today);
  const lastKey = dateKeys.slice().sort().pop() || null;
  return { dateKeys, todayItems, lastKey };
}

function daysAgoLabel(key) {
  if (!key) return "Sin actividad";
  const n = Math.round((new Date(todayKey() + "T00:00:00") - new Date(key + "T00:00:00")) / 86400000);
  if (n <= 0) return "Hoy";
  if (n === 1) return "Ayer";
  return `Hace ${n} días`;
}

function AthleteDetail({ athlete, user, onBack, onUnlink }) {
  const { rmRecords, results: notesFlat } = useAthleteData(athlete.id);
  const [selected, setSelected] = useState(null);
  const [completions, setCompletions] = useState([]);
  const [hyroxSplits, setHyroxSplits] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentsOk, setCommentsOk] = useState(false); // false hasta correr la migración v7
  const [openCommentFor, setOpenCommentFor] = useState(null);
  const [draft, setDraft] = useState("");
  const [commentErr, setCommentErr] = useState("");

  useEffect(() => {
    db.listRoutineCompletions(athlete.id).then(setCompletions).catch(() => {});
    db.listHyroxSplits(athlete.id).then(setHyroxSplits).catch(() => {});
    db.listCommentsForUser(athlete.id).then((c) => { setComments(c); setCommentsOk(true); }).catch(() => setCommentsOk(false));
  }, [athlete.id]);

  const commentsByResult = useMemo(() => {
    const map = {};
    comments.forEach((c) => { (map[c.resultId] = map[c.resultId] || []).push(c); });
    return map;
  }, [comments]);

  const sendComment = async (resultId) => {
    const body = draft.trim();
    if (!body) return;
    setCommentErr("");
    try {
      const c = await db.addResultComment(resultId, user.id, body);
      setComments((list) => [...list, c]);
      setDraft(""); setOpenCommentFor(null);
    } catch (e) {
      setCommentErr(e.message || "No se pudo guardar el comentario.");
    }
  };

  const removeComment = async (id) => {
    try { await db.deleteResultComment(id); setComments((list) => list.filter((c) => c.id !== id)); } catch (e) { /* nada */ }
  };

  const activity = useMemo(
    () => summarizeActivity({
      results: notesFlat, completions,
      hyrox: hyroxSplits.map((h) => ({ createdAt: h.createdAt })),
    }),
    [notesFlat, completions, hyroxSplits]
  );
  const athleteStreaks = useMemo(() => computeStreaks(activity.dateKeys), [activity]);
  const hyroxSessions = useMemo(() => new Set(hyroxSplits.map((h) => h.sessionId)).size, [hyroxSplits]);

  const byExercise = useMemo(() => {
    const map = {};
    (rmRecords || []).forEach((r) => {
      map[r.exercise] = map[r.exercise] || [];
      map[r.exercise].push(r);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => new Date(a.date) - new Date(b.date)));
    return map;
  }, [rmRecords]);

  const exerciseList = Object.keys(byExercise);
  const activeEx = selected || exerciseList[0] || null;

  const improvements = useMemo(() => {
    return exerciseList.map((ex) => {
      const list = byExercise[ex];
      const first = list[0].weight;
      const best = Math.max(...list.map((r) => r.weight));
      return { ex, first, best, delta: best - first, unit: list[0].unit };
    }).filter((i) => i.delta !== 0).sort((a, b) => b.delta - a.delta);
  }, [byExercise, exerciseList]);

  const recentResults = useMemo(() => notesFlat.slice().sort((a, b) => b.savedAt - a.savedAt).slice(0, 12), [notesFlat]);
  const totalNotes = notesFlat.length;

  const chartData = activeEx ? (byExercise[activeEx] || []).map((r) => ({ date: r.date.slice(5), weight: r.weight })) : [];

  if (rmRecords === null) return <p className="box-muted">Cargando ficha…</p>;

  return (
    <div>
      <button className="box-btn box-btn-ghost" style={{ marginBottom: 14 }} onClick={onBack}><ChevronLeft size={14} /> Volver a atletas</button>

      <div className="greeting-card">
        <div className="greeting-left">
          <div className="avatar-circle">{athlete.name.trim().charAt(0).toUpperCase()}</div>
          <div>
            <div className="greeting-name">{athlete.name}</div>
            <div className="box-muted">Ficha técnica · {modalityLabel(athlete.modality)}</div>
          </div>
        </div>
        <button className="box-btn box-btn-danger" onClick={() => onUnlink(athlete.id)}><Unlink2 size={14} /> Desvincular</button>
      </div>

      <div className="stats-row">
        <StatChip icon={Clock} value={daysAgoLabel(activity.lastKey)} label="Última actividad" tint="amber" />
        <StatChip icon={Flame} value={athleteStreaks.current} label="Racha actual (días)" tint="rust" />
        <StatChip icon={TrendingUp} value={athleteStreaks.best} label="Mejor racha (días)" tint="olive" />
        {(athlete.modality === "gap" || athlete.modality === "musculacion") && (
          <StatChip icon={CheckCircle2} value={completions.length} label="Rutinas completadas" tint="olive" />
        )}
        {athlete.modality === "hyrox" && (
          <StatChip icon={CheckCircle2} value={hyroxSessions} label="Simulacros Hyrox" tint="olive" />
        )}
      </div>

      <div className="stats-row">
        <StatChip icon={Dumbbell} value={(rmRecords || []).length} label="RM cargados" tint="amber" />
        <StatChip icon={CheckCircle2} value={totalNotes} label="Resultados registrados" tint="olive" />
        <StatChip icon={TrendingUp} value={improvements.length} label="Ejercicios con mejora" tint="rust" />
      </div>

      <h3 className="box-h3" style={{ marginBottom: 10 }}>Estadísticas mensuales</h3>
      <div style={{ marginBottom: 22 }}>
        <MonthlyStats userId={athlete.id} />
      </div>

      <div style={{ marginBottom: 22 }}>
        <EvolutionStats userId={athlete.id} />
      </div>

      <h3 className="box-h3" style={{ marginBottom: 10 }}>Histórico completo</h3>

      {exerciseList.length === 0 ? (
        <div className="box-card"><p className="box-muted">Este atleta todavía no cargó ningún RM.</p></div>
      ) : (
        <>
          {improvements.length > 0 && (
            <div className="box-card" style={{ marginBottom: 18 }}>
              <h3 className="box-h3" style={{ marginBottom: 10 }}>Evolución por ejercicio</h3>
              {improvements.map((i) => (
                <div className="rm-row" key={i.ex}>
                  <span>{i.ex}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--olive)", fontWeight: 600 }}>
                    <ArrowUpRight size={14} /> +{i.delta} {i.unit} <span className="box-muted" style={{ fontWeight: 400 }}>({i.first} → {i.best})</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="box-card" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
              <select className="box-select" style={{ width: 220 }} value={activeEx} onChange={(e) => setSelected(e.target.value)}>
                {exerciseList.map((ex) => <option key={ex}>{ex}</option>)}
              </select>
              <span className="box-muted">
                Mejor marca: <b style={{ color: "var(--ink)" }}>{Math.max(...(byExercise[activeEx] || [0]).map((r) => r.weight))} {(byExercise[activeEx] || [])[0]?.unit}</b>
              </span>
            </div>
            {chartData.length >= 2 ? (
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="var(--ink-dim)" fontSize={11} />
                    <YAxis stroke="var(--ink-dim)" fontSize={11} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} />
                    <Line type="monotone" dataKey="weight" stroke="var(--amber)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="box-muted">Necesita al menos dos marcas para graficar la evolución.</p>
            )}
          </div>
        </>
      )}

      <div className="box-card">
        <h3 className="box-h3" style={{ marginBottom: 10 }}>Últimos resultados de WOD</h3>
        {recentResults.length === 0 && <p className="box-muted">Todavía no registró resultados de WOD.</p>}
        {recentResults.map((n) => {
          const cs = commentsByResult[n.id] || [];
          return (
            <div key={n.id}>
              <div className="rm-row">
                <div>
                  <b>{n.tipo}</b> <span className="box-muted">· {n.dateKey}</span>
                  {n.comment && <div className="box-muted">{n.comment}</div>}
                </div>
                <span>{formatResultValue(n)} <span className="box-muted">({n.scaling})</span></span>
              </div>
              {cs.map((c) => (
                <div key={c.id} style={{ margin: "4px 0 4px 12px", padding: "6px 10px", background: "var(--amber-tint)", color: "var(--amber-ink)", borderRadius: 8, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span><b>{c.coachName}:</b> {c.body}</span>
                  {c.coachId === user.id && (
                    <button onClick={() => removeComment(c.id)} title="Borrar comentario" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}><X size={13} /></button>
                  )}
                </div>
              ))}
              {commentsOk && (openCommentFor === n.id ? (
                <div style={{ margin: "4px 0 8px 12px" }}>
                  <textarea className="box-input" rows={2} maxLength={500} autoFocus style={{ resize: "vertical", fontFamily: "'Barlow', sans-serif" }}
                    placeholder="Escribile un comentario al atleta…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                  {commentErr && <div className="box-error" style={{ marginTop: 6 }}>{commentErr}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button className="box-btn box-btn-primary" style={{ padding: "5px 12px", fontSize: 13 }} onClick={() => sendComment(n.id)}><Check size={13} /> Enviar</button>
                    <button className="box-btn box-btn-ghost" style={{ padding: "5px 12px", fontSize: 13 }} onClick={() => { setOpenCommentFor(null); setDraft(""); setCommentErr(""); }}><X size={13} /></button>
                  </div>
                </div>
              ) : (
                <button className="box-btn box-btn-ghost" style={{ margin: "2px 0 8px 12px", padding: "3px 10px", fontSize: 12 }}
                  onClick={() => { setOpenCommentFor(n.id); setDraft(""); setCommentErr(""); }}>
                  Comentar
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoachAthletes({ user }) {
  const [athletes, setAthletes] = useState(null);
  const [selected, setSelected] = useState(null);
  const [teamStats, setTeamStats] = useState(null);

  const load = useCallback(async () => {
    const list = await db.listMyAthletes(user.username);
    setAthletes(list);
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  // Actividad reciente de todos los atletas (panel "Quién entrenó hoy").
  const [activity, setActivity] = useState(null);
  useEffect(() => {
    if (!athletes) return;
    if (athletes.length === 0) { setActivity({}); return; }
    db.listAthletesActivity(athletes.map((x) => x.id)).then(setActivity).catch(() => setActivity(false));
  }, [athletes]);
  const summaries = useMemo(() => {
    const map = {};
    if (!activity || !athletes) return map;
    athletes.forEach((x) => { map[x.id] = summarizeActivity(activity[x.id]); });
    return map;
  }, [activity, athletes]);
  const trainedToday = (athletes || []).filter((x) => summaries[x.id] && summaries[x.id].todayItems.length > 0);
  const notYetToday = (athletes || []).filter((x) => summaries[x.id] && summaries[x.id].todayItems.length === 0);

  useEffect(() => {
    if (!athletes) return;
    if (athletes.length === 0) { setTeamStats({ totalThisMonth: 0, inactive: [] }); return; }
    (async () => {
      const now = new Date();
      let totalThisMonth = 0;
      const inactive = [];
      for (const a of athletes) {
        const results = await db.listMyResults(a.id);
        totalThisMonth += results.filter((n) => isInMonth(n.dateKey, now)).length;
        const lastKey = results.map((n) => n.dateKey).filter(Boolean).sort().pop();
        const daysSince = lastKey ? Math.round((now - new Date(lastKey + "T00:00:00")) / 86400000) : null;
        if (daysSince === null || daysSince >= 7) inactive.push({ ...a, daysSince });
      }
      setTeamStats({ totalThisMonth, inactive });
    })();
  }, [athletes]);

  const unlinkAthlete = async (athleteId) => {
    await db.unlinkAthlete(athleteId, user.username);
    setSelected(null);
    load();
  };

  if (selected) {
    return <AthleteDetail athlete={selected} user={user} onBack={() => setSelected(null)} onUnlink={unlinkAthlete} />;
  }

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Mis atletas</h1>

      <div className="box-card" style={{ marginBottom: 18 }}>
        <p className="box-muted">Compartí tu usuario (<b style={{ color: "var(--ink)" }}>{user.username}</b>) para que un atleta se vincule desde sus Ajustes.</p>
      </div>

      {athletes && athletes.length > 0 && (
        <div className="stats-row">
          <StatChip icon={Users} value={athletes.length} label="Atletas vinculados" tint="amber" />
          <StatChip icon={CheckCircle2} value={teamStats ? teamStats.totalThisMonth : "…"} label="WODs del equipo este mes" tint="olive" />
          <StatChip icon={AlertTriangle} value={teamStats ? teamStats.inactive.length : "…"} label="Sin actividad (7+ días)" tint="rust" />
        </div>
      )}

      {athletes && athletes.length > 0 && activity && (
        <div className="box-card" style={{ marginBottom: 18, borderLeft: "3px solid var(--amber)" }}>
          <h3 className="box-h3" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Flame size={14} color="var(--amber)" /> Quién entrenó hoy
            <span className="box-muted" style={{ fontWeight: 400 }}>· {trainedToday.length} de {athletes.length}</span>
          </h3>
          {trainedToday.length === 0 && <p className="box-muted">Todavía nadie registró entrenamiento hoy.</p>}
          {trainedToday.map((x) => (
            <div className="rm-row" key={x.id} style={{ cursor: "pointer" }} onClick={() => setSelected(x)}>
              <span><b>{x.name}</b> <span className="box-badge" style={{ marginLeft: 6 }}>{modalityLabel(x.modality)}</span></span>
              <span className="box-muted" style={{ textAlign: "right", fontSize: 12 }}>{summaries[x.id].todayItems.join(" · ")}</span>
            </div>
          ))}
          {notYetToday.length > 0 && (
            <div className="box-muted" style={{ marginTop: 10, fontSize: 13 }}>
              Todavía no entrenaron: {notYetToday.map((x) => x.name).join(", ")}
            </div>
          )}
        </div>
      )}

      {teamStats && teamStats.inactive.length > 0 && (
        <div className="box-card" style={{ marginBottom: 18, borderColor: "var(--rust)" }}>
          <h3 className="box-h3" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} color="var(--rust)" /> Atletas sin actividad reciente
          </h3>
          {teamStats.inactive.map((a) => (
            <div className="rm-row" key={a.id}>
              <span>{a.name}</span>
              <span className="box-muted">{a.daysSince === null ? "Nunca registró resultados" : `Hace ${a.daysSince} días`}</span>
            </div>
          ))}
        </div>
      )}

      {athletes === null && <p className="box-muted">Cargando…</p>}
      {athletes && athletes.length === 0 && (
        <div className="box-card"><p className="box-muted">Todavía no tenés atletas vinculados.</p></div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {athletes && athletes.map((a) => (
          <div key={a.id} className="wod-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="avatar-circle">{a.name.trim().charAt(0).toUpperCase()}</div>
              <div>
                <div className="greeting-name" style={{ fontSize: 15 }}>
                  {a.name}
                  {a.role === "coach" && <span className="box-badge" style={{ marginLeft: 8, background: "var(--amber-dim)", color: "var(--amber)" }}>Coach</span>}
                </div>
                <div className="box-muted">
                  {a.username} · {modalityLabel(a.modality)}
                  {summaries[a.id] ? ` · ${daysAgoLabel(summaries[a.id].lastKey)}` : ""}
                </div>
              </div>
            </div>
            <button className="box-btn box-btn-primary" onClick={() => setSelected(a)}>Ver ficha</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== MODALIDADES EN CONSTRUCCIÓN ============================== */

function ModalityComingSoon({ modality }) {
  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 14 }}>{modalityLabel(modality)}</h1>
      <div className="box-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <AlertTriangle size={16} color="var(--amber)" />
          <h2 className="box-h2" style={{ margin: 0 }}>Estamos armando esta experiencia</h2>
        </div>
        <p className="box-muted">
          Elegiste <b style={{ color: "var(--ink)" }}>{modalityLabel(modality)}</b> al crear tu cuenta. Las pantallas de WOD, RM,
          estadísticas y timer para esta modalidad todavía están en construcción — muy pronto vas a tenerlas activas acá mismo,
          sin tener que hacer nada de tu lado. Mientras tanto podés usar Ajustes con normalidad.
        </p>
      </div>
    </div>
  );
}

/* ============================== TIMER DE DESCANSO (GAP / Musculación) ============================== */

function RestTimer() {
  const PRESETS = [30, 60, 90];
  const [preset, setPreset] = useState(60);
  const [custom, setCustom] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);
  const startRef = useRef(null);
  const doneRef = useRef(false);
  const pre = usePreStartCountdown(3);
  useWakeLock(running || pre.counting);

  useTicker(running, () => {
    const elapsed = (Date.now() - startRef.current) / 1000;
    const rem = preset - elapsed;
    setRemaining(rem);
    if (rem <= 0 && !doneRef.current) {
      doneRef.current = true;
      beep(660, 500, "square");
      setRunning(false);
    }
  });

  const choose = (secs) => { if (running) return; setPreset(secs); setRemaining(secs); doneRef.current = false; };
  const reallyStart = () => {
    startRef.current = Date.now() - (preset - remaining) * 1000;
    doneRef.current = false;
    setRunning(true);
    beep(880, 150);
  };
  const start = () => { primeAudio(); pre.start(reallyStart); };
  const pause = () => setRunning(false);
  const reset = () => { setRunning(false); setRemaining(preset); doneRef.current = false; };

  return (
    <div className="box-card">
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        {PRESETS.map((s) => (
          <button key={s} className={`box-tabbtn ${preset === s ? "active" : ""}`} onClick={() => choose(s)} disabled={running || pre.counting}>{s}s</button>
        ))}
        <div style={{ width: 90 }}>
          <label className="box-label">Personalizado (s)</label>
          <input className="box-input" type="number" value={custom} onChange={(e) => setCustom(Number(e.target.value))} disabled={running || pre.counting} />
        </div>
        <button className="box-tabbtn" onClick={() => choose(custom)} disabled={running || pre.counting}>Usar</button>
      </div>
      {pre.counting ? (
        <CountdownOverlay count={pre.count} />
      ) : (
        <div className="clock-display" style={{ color: remaining <= 5 && remaining > 0 ? "var(--rust)" : "var(--ink)" }}>{fmtClock(Math.max(0, remaining))}</div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
        {!running ? <button className="box-btn box-btn-primary" onClick={start} disabled={pre.counting}>Start</button> : <button className="box-btn box-btn-ghost" onClick={pause}>Pausar</button>}
        <button className="box-btn box-btn-ghost" onClick={reset} disabled={pre.counting}>Reset</button>
      </div>
    </div>
  );
}

function RoutineTimerScreen() {
  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Descanso entre series</h1>
      <RestTimer />
    </div>
  );
}

/* ============================== RUTINAS (GAP / Musculación) — COACH ============================== */

function RoutineEditor({ user }) {
  const [modality, setModality] = useState("gap");
  const [routines, setRoutines] = useState(null);
  const [sharedRoutines, setSharedRoutines] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formDay, setFormDay] = useState(1);
  const [formSplit, setFormSplit] = useState(ROUTINE_SPLITS.gap[0]);
  const [formExercises, setFormExercises] = useState([{ name: "", sets: "", reps: "", note: "" }]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    setRoutines(null);
    setSharedRoutines([]);
    db.listRoutines(user.id, modality).then(setRoutines);
    if (user.username) {
      db.listSharedCoaches(user.username).then(async (coaches) => {
        if (!coaches.length) return;
        const lists = await Promise.all(
          coaches.map((c) => db.listRoutines(c.id, modality).then((rs) => rs.map((r) => ({ ...r, coachName: c.name }))))
        );
        setSharedRoutines(lists.flat());
      }).catch(() => {});
    }
  }, [user.id, user.username, modality]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingId(null);
    setFormDay(1);
    setFormSplit(ROUTINE_SPLITS[modality][0]);
    setFormExercises([{ name: "", sets: "", reps: "", note: "" }]);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (r) => {
    setEditingId(r.id);
    setFormDay(r.dayOfWeek);
    setFormSplit(r.splitLabel);
    setFormExercises(r.exercises.length ? r.exercises.map((e) => ({ ...e })) : [{ name: "", sets: "", reps: "", note: "" }]);
    setFormError("");
    setShowForm(true);
  };

  const updateExerciseRow = (i, patch) => {
    setFormExercises((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addExerciseRow = () => setFormExercises((rows) => [...rows, { name: "", sets: "", reps: "", note: "" }]);
  const removeExerciseRow = (i) => setFormExercises((rows) => rows.filter((_, idx) => idx !== i));

  const submitForm = async () => {
    setFormError("");
    const exercises = formExercises.filter((e) => e.name.trim()).map((e) => ({
      name: e.name.trim(), sets: e.sets || "", reps: e.reps || "", note: e.note || "",
    }));
    if (!exercises.length) { setFormError("Agregá al menos un ejercicio."); return; }
    const payload = { modality, dayOfWeek: formDay, splitLabel: formSplit, exercises };
    if (editingId) await db.updateRoutine(editingId, payload);
    else await db.createRoutine(user.id, payload);
    await load();
    setShowForm(false);
  };

  const deleteRoutine = async (id) => {
    await db.deleteRoutine(id);
    await load();
    setConfirmDeleteId(null);
  };

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 14 }}>Rutinas</h1>
      <p className="box-muted" style={{ marginBottom: 14 }}>
        Planificación semanal (por día, se repite todas las semanas) para tus atletas de GAP y Musculación.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        <button className={`box-tabbtn ${modality === "gap" ? "active" : ""}`} onClick={() => { setModality("gap"); setShowForm(false); }}>GAP</button>
        <button className={`box-tabbtn ${modality === "musculacion" ? "active" : ""}`} onClick={() => { setModality("musculacion"); setShowForm(false); }}>Musculación</button>
        <button className="box-btn box-btn-primary" style={{ marginLeft: "auto" }} onClick={openNew}><Plus size={14} /> Nueva rutina</button>
      </div>

      {showForm && (
        <div className="box-card" style={{ marginBottom: 18 }}>
          <h3 className="box-h3" style={{ marginBottom: 10 }}>{editingId ? "Editar rutina" : "Nueva rutina"}</h3>
          <TemplateBar
            coachId={user.id}
            kind="routine"
            filter={(t) => !t.data.modality || t.data.modality === modality}
            getData={() => ({
              modality, splitLabel: formSplit,
              exercises: formExercises.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), sets: e.sets || "", reps: e.reps || "", note: e.note || "" })),
            })}
            onApply={(d) => {
              if (d.splitLabel && ROUTINE_SPLITS[modality].includes(d.splitLabel)) setFormSplit(d.splitLabel);
              setFormExercises(d.exercises && d.exercises.length ? d.exercises.map((e) => ({ name: e.name || "", sets: e.sets || "", reps: e.reps || "", note: e.note || "" })) : [{ name: "", sets: "", reps: "", note: "" }]);
            }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ width: 170 }}>
              <label className="box-label">Día de la semana</label>
              <select className="box-select" value={formDay} onChange={(e) => setFormDay(Number(e.target.value))}>
                {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
              </select>
            </div>
            <div style={{ width: 200 }}>
              <label className="box-label">Grupo / split</label>
              <select className="box-select" value={formSplit} onChange={(e) => setFormSplit(e.target.value)}>
                {ROUTINE_SPLITS[modality].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <label className="box-label">Ejercicios</label>
          {formExercises.map((ex, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input className="box-input" style={{ flex: "2 1 160px" }} placeholder="Ejercicio" value={ex.name} onChange={(e) => updateExerciseRow(i, { name: e.target.value })} />
              <input className="box-input" style={{ width: 70 }} placeholder="Series" value={ex.sets} onChange={(e) => updateExerciseRow(i, { sets: e.target.value })} />
              <input className="box-input" style={{ width: 70 }} placeholder="Reps" value={ex.reps} onChange={(e) => updateExerciseRow(i, { reps: e.target.value })} />
              <input className="box-input" style={{ flex: "1 1 120px" }} placeholder="Nota (opcional)" value={ex.note} onChange={(e) => updateExerciseRow(i, { note: e.target.value })} />
              <button className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={() => removeExerciseRow(i)} title="Quitar"><X size={13} /></button>
            </div>
          ))}
          <button className="box-btn box-btn-ghost" style={{ marginBottom: 12 }} onClick={addExerciseRow}><Plus size={13} /> Agregar ejercicio</button>

          {formError && <div className="box-error" style={{ marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="box-btn box-btn-primary" onClick={submitForm}><Check size={14} /> Guardar</button>
            <button className="box-btn box-btn-ghost" onClick={() => setShowForm(false)}><X size={14} /> Cancelar</button>
          </div>
        </div>
      )}

      {routines === null && <p className="box-muted">Cargando…</p>}
      {routines !== null && routines.length === 0 && !showForm && (
        <div className="box-card"><p className="box-muted">Todavía no armaste ninguna rutina de {modality === "gap" ? "GAP" : "Musculación"}.</p></div>
      )}

      <div className="whiteboard">
        {(routines || []).map((r) => (
          <div className="wod-row" key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span className="wod-type">{WEEKDAYS[r.dayOfWeek]}</span>
                <span className="box-badge" style={{ marginLeft: 8 }}>{r.splitLabel}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={() => openEdit(r)} title="Editar"><Pencil size={13} /></button>
                {confirmDeleteId === r.id ? (
                  <>
                    <button className="box-btn box-btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => deleteRoutine(r.id)}>Sí, borrar</button>
                    <button className="box-btn box-btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                  </>
                ) : (
                  <button className="icon-btn-circle" style={{ width: 28, height: 28 }} onClick={() => setConfirmDeleteId(r.id)} title="Borrar"><Trash2 size={13} /></button>
                )}
              </div>
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {r.exercises.map((ex, i) => (
                <div key={i} className="box-muted" style={{ fontSize: 13 }}>
                  <b style={{ color: "var(--ink)" }}>{ex.name}</b>
                  {ex.sets || ex.reps ? ` — ${ex.sets || "?"} x ${ex.reps || "?"}` : ""}
                  {ex.note ? ` · ${ex.note}` : ""}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sharedRoutines.length > 0 && (
        <>
          <h3 className="box-h3" style={{ margin: "22px 0 10px" }}>De otros coaches (atletas en común)</h3>
          <div className="whiteboard">
            {sharedRoutines.map((r) => (
              <div className="wod-row" key={r.id} style={{ opacity: 0.85 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span className="wod-type">{WEEKDAYS[r.dayOfWeek]}</span>
                    <span className="box-badge" style={{ marginLeft: 8 }}>{r.splitLabel}</span>
                  </div>
                  <span className="box-muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Coach: {r.coachName}</span>
                </div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {r.exercises.map((ex, i) => (
                    <div key={i} className="box-muted" style={{ fontSize: 13 }}>
                      <b style={{ color: "var(--ink)" }}>{ex.name}</b>
                      {ex.sets || ex.reps ? ` — ${ex.sets || "?"} x ${ex.reps || "?"}` : ""}
                      {ex.note ? ` · ${ex.note}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================== RUTINAS (GAP / Musculación) — ATLETA ============================== */

function RoutineToday({ user, onCoachesReload, sourceKey, onSourceChange }) {
  const coaches = user.coaches || [];
  const activeCoach = coaches.find((c) => c.username === sourceKey) || coaches[0] || null;
  const [routines, setRoutines] = useState(null);
  const [completions, setCompletions] = useState([]);
  const [checked, setChecked] = useState({});
  const [logging, setLogging] = useState(null); // exercise name being logged
  const [logWeight, setLogWeight] = useState("");
  const todayDow = new Date().getDay();

  const load = useCallback(() => {
    if (!activeCoach) { setRoutines([]); return; }
    setRoutines(null);
    db.listRoutines(activeCoach.id, user.modality).then(setRoutines);
  }, [activeCoach, user.modality]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { db.listRoutineCompletions(user.id).then(setCompletions); }, [user.id]);

  if (coaches.length === 0) {
    return (
      <div>
        <h1 className="box-h1" style={{ marginBottom: 14 }}>Hoy</h1>
        <LinkCoachForm user={user} onLinked={onCoachesReload} />
      </div>
    );
  }

  const todays = (routines || []).filter((r) => r.dayOfWeek === todayDow);
  const key = todayKey();
  const isDone = (routineId) => completions.some((c) => c.routineId === routineId && c.dateKey === key);

  const toggleCheck = (routineId, i) => {
    setChecked((c) => ({ ...c, [`${routineId}-${i}`]: !c[`${routineId}-${i}`] }));
  };

  const saveLog = async (exerciseName) => {
    if (!logWeight) { setLogging(null); return; }
    await checkRmPR(user.id, exerciseName, logWeight, "kg");
    await db.addRmRecord(user.id, { exercise: exerciseName, weight: Number(logWeight), unit: "kg", date: key, note: "" });
    setLogWeight("");
    setLogging(null);
  };

  const markComplete = async (routineId) => {
    await db.markRoutineComplete(user.id, routineId, key);
    const list = await db.listRoutineCompletions(user.id);
    setCompletions(list);
  };

  return (
    <div>
      <div className="greeting-card">
        <div className="greeting-left">
          <div className="avatar-circle">{user.name.trim().charAt(0).toUpperCase()}</div>
          <div>
            <div className="greeting-name">Hola, {user.name.split(" ")[0]}</div>
            <div className="box-muted">{new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
        </div>
      </div>

      {coaches.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {coaches.map((c) => (
            <button key={c.username} className={`box-tabbtn ${activeCoach && activeCoach.username === c.username ? "active" : ""}`} onClick={() => onSourceChange && onSourceChange(c.username)}>{c.name}</button>
          ))}
        </div>
      )}

      {routines === null && <p className="box-muted">Cargando…</p>}

      {routines !== null && todays.length === 0 && (
        <div className="box-card"><p className="box-muted">Tu coach todavía no cargó una rutina para hoy ({WEEKDAYS[todayDow]}).</p></div>
      )}

      {todays.map((r) => (
        <div className="box-card accent-left" style={{ marginBottom: 18 }} key={r.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="box-badge">{r.splitLabel}</span>
            {isDone(r.id) && (
              <span className="box-badge" style={{ background: "var(--olive-tint)", color: "var(--olive)", borderLeftColor: "var(--olive)" }}>
                <Check size={11} /> Completada hoy
              </span>
            )}
          </div>
          {r.exercises.map((ex, i) => {
            const k = `${r.id}-${i}`;
            return (
              <div key={i} style={{ borderBottom: "1px solid var(--line)", padding: "9px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{ex.name}</div>
                    <div className="box-muted" style={{ fontSize: 12 }}>
                      {ex.sets || "?"} x {ex.reps || "?"}{ex.note ? ` · ${ex.note}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCheck(r.id, i)}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                      border: checked[k] ? "1px solid var(--olive)" : "1px solid var(--line)",
                      background: checked[k] ? "var(--olive-tint)" : "transparent",
                      color: "var(--olive)", display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {checked[k] && <Check size={14} />}
                  </button>
                </div>
                {logging === ex.name ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <input className="box-input" style={{ width: 100 }} type="number" placeholder="kg" value={logWeight} onChange={(e) => setLogWeight(e.target.value)} />
                    <button className="box-btn box-btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => saveLog(ex.name)}>Guardar</button>
                    <button className="box-btn box-btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setLogging(null)}>Cancelar</button>
                  </div>
                ) : (
                  <button className="box-btn box-btn-ghost" style={{ marginTop: 6, padding: "4px 10px", fontSize: 11.5 }} onClick={() => { setLogging(ex.name); setLogWeight(""); }}>
                    <Dumbbell size={12} /> Registrar peso usado
                  </button>
                )}
              </div>
            );
          })}
          {!isDone(r.id) && (
            <button className="box-btn box-btn-primary" style={{ width: "100%", marginTop: 12 }} onClick={() => markComplete(r.id)}>
              <Check size={14} /> Marcar rutina como completa
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================== PROGRESO (GAP / Musculación) ============================== */

function ProgresoScreen({ user }) {
  const [completions, setCompletions] = useState(null);

  useEffect(() => { db.listRoutineCompletions(user.id).then(setCompletions); }, [user.id]);

  const dateSet = useMemo(() => new Set((completions || []).map((c) => c.dateKey)), [completions]);

  const streak = useMemo(() => {
    if (!completions) return 0;
    let count = 0;
    let d = new Date();
    while (dateSet.has(toKey(d))) {
      count++;
      d = new Date(d); d.setDate(d.getDate() - 1);
    }
    return count;
  }, [completions, dateSet]);

  const heatCells = useMemo(() => {
    const cells = [];
    const d = new Date();
    d.setDate(d.getDate() - 83);
    for (let i = 0; i < 84; i++) {
      cells.push(dateSet.has(toKey(d)));
      d.setDate(d.getDate() + 1);
    }
    return cells;
  }, [dateSet]);

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Progreso</h1>
      <div className="stats-row">
        <StatChip icon={Flame} value={streak} label="Racha actual" tint="amber" />
        <StatChip icon={CheckCircle2} value={completions ? completions.length : 0} label="Rutinas completadas" tint="olive" />
      </div>
      <div className="box-card" style={{ marginBottom: 18 }}>
        <h3 className="box-h3" style={{ marginBottom: 8 }}>Constancia · últimas 12 semanas</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3 }}>
          {heatCells.map((done, i) => (
            <div key={i} style={{ aspectRatio: "1", borderRadius: 2, background: done ? "var(--amber)" : "var(--panel-2)" }} />
          ))}
        </div>
      </div>
      <RmTracker user={user} />
    </div>
  );
}

/* ============================== HYROX ============================== */

function HyroxToday({ user }) {
  const [sessionId, setSessionId] = useState(null);
  const [segIndex, setSegIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [splits, setSplits] = useState([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const startRef = useRef(null);
  useWakeLock(running);

  useTicker(running, () => setElapsed((Date.now() - startRef.current) / 1000));

  const startSegment = () => {
    primeAudio();
    startRef.current = Date.now();
    setElapsed(0);
    setRunning(true);
    beep(880, 150);
  };

  const startRace = () => {
    const id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setSessionId(id);
    setSegIndex(0);
    setSplits([]);
    setFinished(false);
    startSegment();
  };

  const markSegment = async () => {
    const seg = HYROX_SEGMENTS[segIndex];
    const secs = Math.round(elapsed);
    setRunning(false);
    setSaving(true);
    try {
      await db.addHyroxSplit(user.id, { sessionId, segmentIndex: segIndex, segmentName: seg.name, seconds: secs });
    } finally {
      setSaving(false);
    }
    setSplits((s) => [...s, { segmentName: seg.name, seconds: secs }]);
    if (segIndex + 1 >= HYROX_SEGMENTS.length) {
      setFinished(true);
      beep(660, 700, "square");
    } else {
      setSegIndex((i) => i + 1);
      startSegment();
    }
  };

  const cancelRace = () => {
    setRunning(false);
    setSessionId(null);
    setSegIndex(0);
    setSplits([]);
    setFinished(false);
  };

  const totalSeconds = splits.reduce((a, s) => a + s.seconds, 0);

  if (!sessionId) {
    return (
      <div>
        <h1 className="box-h1" style={{ marginBottom: 16 }}>Hoy</h1>
        <div className="box-card">
          <h2 className="box-h2" style={{ marginBottom: 8 }}>Simulacro completo</h2>
          <p className="box-muted" style={{ marginBottom: 14 }}>
            8 corridas de 1km alternadas con las 8 estaciones, en el orden real de carrera. Vas a ir marcando cada tramo a
            medida que lo termines y quedan guardados los parciales.
          </p>
          <button className="box-btn box-btn-primary" onClick={startRace}><ArrowUpRight size={14} /> Iniciar simulacro</button>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div>
        <h1 className="box-h1" style={{ marginBottom: 16 }}>¡Simulacro completo!</h1>
        <div className="box-card" style={{ marginBottom: 18 }}>
          <div className="clock-display">{fmtRaceClock(totalSeconds)}</div>
          <p className="box-muted" style={{ textAlign: "center" }}>Tiempo total</p>
        </div>
        <div className="box-card" style={{ marginBottom: 18 }}>
          <h3 className="box-h3" style={{ marginBottom: 8 }}>Parciales</h3>
          {splits.map((s, i) => (
            <div className="rm-row" key={i}><span>{i + 1}. {s.segmentName}</span><b>{fmtRaceClock(s.seconds)}</b></div>
          ))}
        </div>
        <button className="box-btn box-btn-primary" onClick={cancelRace}><Repeat size={14} /> Nuevo simulacro</button>
      </div>
    );
  }

  const seg = HYROX_SEGMENTS[segIndex];
  const nextSeg = HYROX_SEGMENTS[segIndex + 1];

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Simulacro en curso</h1>
      <div className="box-card" style={{ marginBottom: 14 }}>
        <p className="box-muted" style={{ textAlign: "center", marginBottom: 2 }}>Estación {segIndex + 1} de {HYROX_SEGMENTS.length}</p>
        <h2 className="box-h2" style={{ textAlign: "center" }}>{seg.name}</h2>
        <div className="clock-display">{fmtRaceClock(elapsed)}</div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button className="box-btn box-btn-primary" disabled={saving} onClick={markSegment}><Check size={14} /> Marcar tramo</button>
        </div>
        {nextSeg && <p className="box-muted" style={{ textAlign: "center", marginTop: 10 }}>Siguiente: {nextSeg.name}</p>}
      </div>
      {splits.length > 0 && (
        <div className="box-card" style={{ marginBottom: 14 }}>
          <h3 className="box-h3" style={{ marginBottom: 8 }}>Parciales de hoy</h3>
          {splits.map((s, i) => (
            <div className="rm-row" key={i}><span>{i + 1}. {s.segmentName}</span><b>{fmtRaceClock(s.seconds)}</b></div>
          ))}
        </div>
      )}
      <button className="box-btn box-btn-ghost" onClick={cancelRace}><X size={14} /> Cancelar simulacro</button>
    </div>
  );
}

function HyroxStations({ user }) {
  const [splits, setSplits] = useState(null);

  useEffect(() => { db.listHyroxSplits(user.id).then(setSplits); }, [user.id]);

  const bestByStation = useMemo(() => {
    const map = {};
    (splits || []).forEach((s) => {
      if (!HYROX_STATIONS.includes(s.segmentName)) return;
      if (!map[s.segmentName] || s.seconds < map[s.segmentName]) map[s.segmentName] = s.seconds;
    });
    return map;
  }, [splits]);

  if (splits === null) return <p className="box-muted">Cargando…</p>;

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Estaciones</h1>
      <div className="box-card">
        <h2 className="box-h2" style={{ marginBottom: 10 }}>Tus mejores marcas</h2>
        {HYROX_STATIONS.map((name) => (
          <div className="rm-row" key={name}>
            <span>{name}</span>
            {bestByStation[name] != null ? (
              <span className="box-badge" style={{ background: "var(--olive-tint)", color: "var(--olive)", borderLeftColor: "var(--olive)" }}>
                <Flame size={11} /> {fmtRaceClock(bestByStation[name])}
              </span>
            ) : (
              <span className="box-muted">Sin marca todavía</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HyroxStats({ user }) {
  const [splits, setSplits] = useState(null);

  useEffect(() => { db.listHyroxSplits(user.id).then(setSplits); }, [user.id]);

  const sessions = useMemo(() => {
    const map = {};
    (splits || []).forEach((s) => {
      (map[s.sessionId] = map[s.sessionId] || []).push(s);
    });
    return Object.entries(map)
      .map(([id, list]) => ({
        id,
        total: list.reduce((a, s) => a + s.seconds, 0),
        finished: list.length >= HYROX_SEGMENTS.length,
        at: list[0]?.createdAt,
      }))
      .filter((s) => s.finished)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [splits]);

  const chartData = sessions.map((s, i) => ({ session: `#${i + 1}`, total: Math.round(s.total / 60 * 10) / 10 }));
  const best = sessions.length ? Math.min(...sessions.map((s) => s.total)) : null;

  const weakestStation = useMemo(() => {
    const sums = {};
    const counts = {};
    (splits || []).forEach((s) => {
      if (!HYROX_STATIONS.includes(s.segmentName)) return;
      sums[s.segmentName] = (sums[s.segmentName] || 0) + s.seconds;
      counts[s.segmentName] = (counts[s.segmentName] || 0) + 1;
    });
    let worst = null;
    Object.keys(sums).forEach((name) => {
      const avg = sums[name] / counts[name];
      if (!worst || avg > worst.avg) worst = { name, avg };
    });
    return worst;
  }, [splits]);

  if (splits === null) return <p className="box-muted">Cargando…</p>;

  return (
    <div>
      <h1 className="box-h1" style={{ marginBottom: 16 }}>Stats</h1>
      <div className="box-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 className="box-h2">Tiempo total de carrera</h2>
          {best != null && (
            <span className="box-badge" style={{ background: "var(--olive-tint)", color: "var(--olive)", borderLeftColor: "var(--olive)" }}>
              <Flame size={11} /> Mejor: {fmtRaceClock(best)}
            </span>
          )}
        </div>
        {chartData.length >= 2 ? (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="session" stroke="var(--ink-dim)" fontSize={11} />
                <YAxis stroke="var(--ink-dim)" fontSize={11} domain={["auto", "auto"]} unit="m" />
                <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} />
                <Line type="monotone" dataKey="total" stroke="var(--amber)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="box-muted">Completá al menos dos simulacros para ver la evolución en gráfico.</p>
        )}
      </div>
      {weakestStation && (
        <div className="box-card">
          <h3 className="box-h3" style={{ marginBottom: 8 }}>Estación más débil</h3>
          <div className="rm-row">
            <span>{weakestStation.name}</span>
            <span className="box-badge" style={{ background: "var(--rust-tint)", color: "var(--rust)", borderLeftColor: "var(--rust)" }}>
              <AlertTriangle size={11} /> Promedio {fmtRaceClock(weakestStation.avg)} · foco acá
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== APP ROOT ============================== */

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [screen, setScreen] = useState("wod");
  // Coach/plan seleccionado por el atleta: se mantiene al cambiar de pantalla
  // y también al recargar la app (respaldo en el navegador, sin romper si no está disponible).
  const [sourceKey, setSourceKeyState] = useState(null);
  const sourceStorageKey = user ? `stampede:source:${user.id}` : null;
  useEffect(() => {
    if (!sourceStorageKey) { setSourceKeyState(null); return; }
    try { setSourceKeyState(window.localStorage.getItem(sourceStorageKey)); } catch (e) { /* sin storage: queda en memoria */ }
  }, [sourceStorageKey]);
  const setSourceKey = (k, opts) => {
    setSourceKeyState(k);
    // el valor por defecto automático no se guarda; solo lo que el atleta elige a mano
    if (sourceStorageKey && k && !(opts && opts.auto)) { try { window.localStorage.setItem(sourceStorageKey, k); } catch (e) { /* ignorar */ } }
  };

  const attachCoaches = async (baseUser) => {
    if (!baseUser) return null;
    const coaches = await db.listMyCoaches(baseUser.id).catch(() => []);
    return { ...baseUser, coaches };
  };

  useEffect(() => {
    db.getSessionUser().then(attachCoaches).then((u) => { setUser(u); setCheckingSession(false); }).catch(() => setCheckingSession(false));

    const unsubscribe = db.onAuthChange((session) => {
      if (session === null) {
        setUser(null);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });

    return () => { unsubscribe(); sub.subscription.unsubscribe(); };
  }, []);

  const updateUser = (patch) => setUser((u) => ({ ...u, ...patch }));
  const reloadCoaches = async () => {
    const coaches = await db.listMyCoaches(user.id).catch(() => []);
    updateUser({ coaches });
  };
  const logout = async () => { await db.signOut(); setUser(null); };
  // Los usuarios existentes no tienen "modality" cargado todavía en el cliente
  // hasta que corra la migración -> por defecto siempre se comportan como Crossfit.
  // Los coaches siempre navegan con el set de Crossfit (arman contenido para
  // todas las modalidades de sus atletas desde ahí), sin importar su propia modalidad.
  const isCrossfit = !user || !user.modality || user.modality === "crossfit" || user.role === "coach";
  const isHyrox = !!user && user.role !== "coach" && user.modality === "hyrox";
  const isRoutineModality = !!user && user.role !== "coach" && (user.modality === "gap" || user.modality === "musculacion");
  const navSet = isHyrox ? NAV_HYROX : isRoutineModality ? NAV_ROUTINE : NAV_CROSSFIT;
  const navItems = user ? navSet.filter((n) => !n.coachOnly || user.role === "coach") : [];

  if (checkingSession) {
    return (
      <div className="box-app">
        <GlobalStyle />
        <div className="box-topstripe" />
        <div className="box-auth-wrap"><StampedeLoaderAnim /></div>
      </div>
    );
  }

  if (passwordRecovery) {
    return (
      <div className="box-app">
        <GlobalStyle />
        <div className="box-topstripe" />
        <SetNewPasswordScreen onDone={() => setPasswordRecovery(false)} />
      </div>
    );
  }

  return (
    <div className="box-app">
      <GlobalStyle />
      <PRBanner />
      <div className="box-topstripe" />
      {!user ? (
        <AuthScreen onLogin={(u) => attachCoaches(u).then(setUser)} />
      ) : (
        <>
          <div className="box-shell">
            <div className="box-sidebar">
              <div className="box-brand">
                <StampedeLogo height={24} />
                <span className="box-h2 brand-word" style={{ fontSize: 16, letterSpacing: 0 }}>STAMPEDE</span>
              </div>
              <div className="box-navlist">
                {navItems.map((n) => (
                  <button key={n.id} className={`box-navitem ${screen === n.id ? "active" : ""}`} onClick={() => setScreen(n.id)}>
                    <n.icon size={16} /> {n.label}
                  </button>
                ))}
              </div>
              <div className="box-userfoot">
                <div className="box-userrow"><User size={14} /> {user.name} <span className="box-muted">· {user.role === "coach" ? "Coach" : "Atleta"}</span></div>
                <button className="box-logout" onClick={logout}><LogOut size={14} /> Cerrar sesión</button>
              </div>
            </div>

            <div className="box-main">
              {isCrossfit ? (
                <>
                  {screen === "wod" && <WodBoard user={user} onUserUpdate={updateUser} onCoachesReload={reloadCoaches} sourceKey={sourceKey} onSourceChange={setSourceKey} />}
                  {screen === "rm" && <RmTracker user={user} />}
                  {screen === "stats" && <StatsScreen user={user} />}
                  {screen === "routines" && user.role === "coach" && <RoutineEditor user={user} />}
                </>
              ) : isHyrox ? (
                <>
                  {screen === "wod" && <HyroxToday user={user} />}
                  {screen === "stations" && <HyroxStations user={user} />}
                  {screen === "stats" && <HyroxStats user={user} />}
                </>
              ) : isRoutineModality ? (
                <>
                  {screen === "wod" && <RoutineToday user={user} onCoachesReload={reloadCoaches} sourceKey={sourceKey} onSourceChange={setSourceKey} />}
                  {screen === "rm" && <ProgresoScreen user={user} />}
                </>
              ) : (
                ["wod", "rm", "stats"].includes(screen) && <ModalityComingSoon modality={user.modality} />
              )}
              {/* El timer queda siempre montado (aunque no se esté viendo) para que
                  no se reinicie el cronómetro al cambiar de pantalla. */}
              <div style={{ display: screen === "timer" ? "block" : "none" }}>
                {isCrossfit ? <TimerScreen user={user} /> : isRoutineModality ? <RoutineTimerScreen /> : <ModalityComingSoon modality={user.modality} />}
              </div>
              {screen === "athletes" && user.role === "coach" && <CoachAthletes user={user} />}
              {screen === "settings" && <SettingsScreen user={user} onLogout={logout} onUserUpdate={updateUser} onCoachesReload={reloadCoaches} />}
            </div>
          </div>

          <div className="box-bottomnav">
            {navItems.map((n) => (
              <button key={n.id} className={`box-bottomitem ${screen === n.id ? "active" : ""}`} onClick={() => setScreen(n.id)}>
                <n.icon size={18} /> {n.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
