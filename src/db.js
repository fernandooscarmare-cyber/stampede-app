import { supabase } from "./supabaseClient";

/* ============================================================
   AUTH
   ============================================================ */

async function ensureProfile(authUser) {
  let profile = await getProfile(authUser.id);
  if (profile) return profile;

  const meta = authUser.user_metadata || {};
  const { error } = await supabase.from("profiles").insert({
    id: authUser.id,
    username: meta.username,
    name: meta.name,
    role: meta.role || "atleta",
    coach_username: null,
  });
  if (error) {
    if (error.code === "23505") throw new Error("Ese usuario ya existe.");
    throw error;
  }
  return await getProfile(authUser.id);
}

export async function signUp({ email, password, name, username, role }) {
  const key = username.trim().toLowerCase();

  // Chequeamos que el usuario público no esté tomado antes de crear la cuenta
  const { data: existing, error: checkErr } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", key)
    .maybeSingle();
  if (checkErr && checkErr.code !== "PGRST116") throw checkErr;
  if (existing) throw new Error("Ese usuario ya existe.");

  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name, username: key, role } },
  });
  if (error) throw error;

  if (!data.session) {
    // "Confirm email" está activado: todavía no hay sesión. El perfil se
    // crea solo la primera vez que haya una sesión real (ver ensureProfile
    // en signIn / getSessionUser), una vez que confirme el mail.
    throw new Error(
      "Cuenta creada. Revisá tu mail para confirmarla y después iniciá sesión."
    );
  }

  // "Confirm email" está desactivado: ya hay sesión activa, creamos el perfil ya.
  const profile = await ensureProfile(data.user);
  return { ...profile, email: data.user.email };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const profile = await ensureProfile(data.user);
  return { ...profile, email: data.user.email };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSessionUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const profile = await ensureProfile(session.user);
  if (!profile) return null;
  return { ...profile, email: session.user.email };
}

export function onAuthChange(callback) {
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => sub.subscription.unsubscribe();
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function updateMyPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/* ============================================================
   PERFILES / COACH-ATLETA
   ============================================================ */

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, username: data.username, name: data.name, role: data.role, coachUsername: data.coach_username };
}

export async function getProfileByUsername(username) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function becomeCoach(userId) {
  const { error } = await supabase.from("profiles").update({ role: "coach" }).eq("id", userId);
  if (error) throw error;
}

export async function linkCoach(userId, coachUsername) {
  const key = coachUsername.trim().toLowerCase();
  const coach = await getProfileByUsername(key);
  if (!coach || coach.role !== "coach") {
    throw new Error("No encontramos un coach con ese usuario.");
  }
  const { error } = await supabase.from("profiles").update({ coach_username: key }).eq("id", userId);
  if (error) throw error;
  return key;
}

export async function unlinkCoach(userId) {
  const { error } = await supabase.from("profiles").update({ coach_username: null }).eq("id", userId);
  if (error) throw error;
}

export async function unlinkAthlete(athleteUserId) {
  const { error } = await supabase.from("profiles").update({ coach_username: null }).eq("id", athleteUserId);
  if (error) throw error;
}

export async function listMyAthletes(coachUsername) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, name, role")
    .eq("coach_username", coachUsername);
  if (error) throw error;
  return data || [];
}

// Borra los datos de la cuenta (RM, WODs, resultados, planilla se van solos
// por ON DELETE CASCADE al borrar el perfil). No borra el usuario de Auth
// en sí -eso requiere permisos de administrador que el cliente no tiene-,
// pero sin perfil la cuenta queda inutilizable y sin ningún dato asociado.
export async function deleteMyAccount(userId) {
  const { error } = await supabase.from("profiles").delete().eq("id", userId);
  if (error) throw error;
  await signOut();
}

/* ============================================================
   RM (récords)
   ============================================================ */

export async function listRmRecords(userId) {
  const { data, error } = await supabase
    .from("rm_records")
    .select("*")
    .eq("user_id", userId)
    .order("record_date", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, exercise: r.exercise, weight: Number(r.weight), unit: r.unit, date: r.record_date, note: r.note || "",
  }));
}

export async function addRmRecord(userId, { exercise, weight, unit, date, note }) {
  const { data, error } = await supabase
    .from("rm_records")
    .insert({ user_id: userId, exercise, weight, unit, record_date: date, note: note || null })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, exercise: data.exercise, weight: Number(data.weight), unit: data.unit, date: data.record_date, note: data.note || "" };
}

export async function deleteRmRecord(id) {
  const { error } = await supabase.from("rm_records").delete().eq("id", id);
  if (error) throw error;
}

export async function listCustomExercises(userId) {
  const { data, error } = await supabase.from("rm_custom_exercises").select("name").eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((r) => r.name);
}

export async function addCustomExercise(userId, name) {
  const { error } = await supabase.from("rm_custom_exercises").insert({ user_id: userId, name });
  if (error && error.code !== "23505") throw error; // 23505 = ya existía, no pasa nada
}

/* ============================================================
   WODs
   ============================================================ */

function mapWodRow(w) {
  return {
    id: w.id,
    dateKey: w.wod_date,
    tipo: w.tipo,
    movilidad: w.movilidad || "",
    core: w.core || "",
    skillType: w.skill_type || "Gimnástico",
    skillContent: w.skill_content || "",
    estructura: w.estructura || "",
    wod: w.wod_content,
    extraNotes: w.extra_notes || "",
  };
}

export async function listWods(coachId) {
  if (!coachId) return [];
  const { data, error } = await supabase
    .from("wods")
    .select("*")
    .eq("coach_id", coachId)
    .order("wod_date", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapWodRow);
}

export async function createWod(coachId, payload) {
  const { data, error } = await supabase
    .from("wods")
    .insert({
      coach_id: coachId,
      wod_date: payload.dateKey,
      tipo: payload.tipo,
      movilidad: payload.movilidad || null,
      core: payload.core || null,
      skill_type: payload.skillType || null,
      skill_content: payload.skillContent || null,
      estructura: payload.estructura || null,
      wod_content: payload.wod,
      extra_notes: payload.extraNotes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapWodRow(data);
}

export async function updateWod(id, payload) {
  const { data, error } = await supabase
    .from("wods")
    .update({
      wod_date: payload.dateKey,
      tipo: payload.tipo,
      movilidad: payload.movilidad || null,
      core: payload.core || null,
      skill_type: payload.skillType || null,
      skill_content: payload.skillContent || null,
      estructura: payload.estructura || null,
      wod_content: payload.wod,
      extra_notes: payload.extraNotes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapWodRow(data);
}

export async function deleteWod(id) {
  const { error } = await supabase.from("wods").delete().eq("id", id);
  if (error) throw error;
}

export async function importWodsFromRows(coachId, rows) {
  const payload = rows.map((r) => ({
    coach_id: coachId,
    wod_date: r.dateKey,
    tipo: r.tipo,
    wod_content: r.wod,
    extra_notes: r.extraNotes || null,
  }));
  const { error } = await supabase.from("wods").insert(payload);
  if (error) throw error;
}

/* ============================================================
   PLANILLA DEL COACH (importación opcional desde Google Sheet)
   ============================================================ */

export async function getCoachSheetUrl(coachId) {
  const { data, error } = await supabase.from("coach_sheets").select("sheet_url").eq("coach_id", coachId).maybeSingle();
  if (error) throw error;
  return data?.sheet_url || "";
}

export async function setCoachSheetUrl(coachId, url) {
  const { error } = await supabase.from("coach_sheets").upsert({ coach_id: coachId, sheet_url: url, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ============================================================
   RESULTADOS DE WOD
   ============================================================ */

function mapResultRow(r) {
  return {
    id: r.id,
    wodId: r.wod_id,
    time: r.time_result || "",
    rounds: r.rounds,
    reps: r.reps,
    scaling: r.scaling || "RX",
    comment: r.comment || "",
    savedAt: new Date(r.created_at).getTime(),
    // datos del WOD embebido (join), para no tener que resolverlo aparte
    dateKey: r.wods?.wod_date,
    tipo: r.wods?.tipo,
    wod: r.wods?.wod_content,
  };
}

export async function listResultsForWod(wodId, userId) {
  const { data, error } = await supabase
    .from("wod_results")
    .select("*, wods(wod_date, tipo, wod_content)")
    .eq("wod_id", wodId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapResultRow);
}

// Todos los resultados de un usuario (para Stats/Evolución), con el WOD embebido
export async function listMyResults(userId) {
  const { data, error } = await supabase
    .from("wod_results")
    .select("*, wods(wod_date, tipo, wod_content)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapResultRow);
}

export async function addResult({ wodId, userId, time, rounds, reps, scaling, comment }) {
  const { data, error } = await supabase
    .from("wod_results")
    .insert({
      wod_id: wodId, user_id: userId, time_result: time || null,
      rounds: rounds ?? null, reps: reps ?? null, scaling, comment: comment || null,
    })
    .select("*, wods(wod_date, tipo, wod_content)")
    .single();
  if (error) throw error;
  return mapResultRow(data);
}
