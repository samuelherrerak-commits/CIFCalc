# CIFCalc — Migración a Supabase

## Credenciales actuales

- **URL:** `https://vejbpctlurbojbvsxquq.supabase.co`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlamJwY3RsdXJib2pidnN4cXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MjQ4MTIsImV4cCI6MjEwNDEwMDgxMn0.mWrAUCOUxWLuOjUUJd5WnoitX-I3EX71nNlkOSLnhUY`

## Pasos para aplicar el esquema

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard)
2. Seleccionar el proyecto `vejbpctlurbojbvsxquq`
3. Ir a **SQL Editor** (menú izquierdo)
4. Copiar el contenido de `supabase/schema.sql`
5. Pegar en el editor y hacer clic en **Run**
6. Verificar que las 4 tablas aparecen en **Table Editor**:
   - `companies`
   - `suppliers`
   - `containers`
   - `items`

## Migración de datos locales

La migración es **automática**. Cuando abras la app con Supabase configurado:

- Si localStorage tiene datos y la BD está vacía → se suben automáticamente a Supabase
- Si la BD ya tiene datos → se usan esos (se ignora localStorage)
- Si no hay conexión a Supabase → la app funciona normalmente con localStorage

No se borra nada del localStorage en ningún momento.

## Verificación

1. Abrir la app en el navegador
2. Abrir consola del navegador (F12)
3. Buscar mensajes como `CIFCalc: datos migrados a la nube` o `CIFCalc: conectado a Supabase`
4. Ir a Supabase Dashboard → Table Editor → verificar que los datos aparecen

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `supabase/schema.sql` | DDL de las 4 tablas + RLS + índices |
| `supabase/migrate.md` | Este archivo (instrucciones) |
| `js/supabase-config.js` | URL + anon key |
| `index.html` | CDN de `supabase-js@2` |
| `js/store.js` | Capa híbrida (Supabase + localStorage) |
