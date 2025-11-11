// En: frontend/src/lib/supabase.js

import { createClient } from '@supabase/supabase-js'

// Estas variables las leeremos de un archivo .env en el frontend
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⛔️ Error fatal: Faltan variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY")
}

// Exportamos el cliente de Supabase para usarlo en la app
export const supabase = createClient(supabaseUrl, supabaseAnonKey)