import { createClient } from "@supabase/supabase-js";

// Estas dos vienen de variables de entorno (.env / Vercel), nunca hardcodeadas
// en el código para poder cambiarlas sin tocar nada más.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Creá un archivo .env " +
    "en la raíz del proyecto (mirá .env.example) o configurá esas variables en Vercel."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
