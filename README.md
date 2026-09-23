# Hilo

Gestión de encargos para tiendas que fabrican o transforman por encargo con proveedores externos: joyerías, sastrerías, tapicerías, carpinterías, imprentas… Cada encargo tiene su hilo, de la petición a la entrega, y cada persona ve lo que le toca hacer.

Nada de lo que se ve depende de un sector: nombres, campos, etapas, condiciones para avanzar, mensajes y permisos se configuran en **Ajustes**. Al crear una tienda se puede partir de una plantilla de sector y cambiarlo todo después.

## Qué incluye

- Encargos con flujo por etapas, condiciones para avanzar (puertas), incidencias y deshacer.
- Bandejas por rol: *Mi trabajo*, *Revisar*, *Bloqueados*, listos para entregar, en proveedor.
- Búsqueda, filtros, agrupación, vista tablero y buscador global (⌘K).
- Clientes, productos y proveedores con campos propios; portal para proveedores externos.
- Mensajes a clientes con plantillas (WhatsApp / correo), ficha imprimible y adjuntos.
- Informes por periodo, series de numeración por tipo de encargo y periodos archivables.
- Equipo y roles, invitación por enlace, dominio aprobado, verificación en dos pasos y modo «Ver como».
- Tiempo real, móvil (instalable como app) y formato local de fechas y números.

## Tecnología

- **Base de datos y acceso:** [Supabase](https://supabase.com) (Postgres, RLS, Storage, Realtime, Auth).
- **App:** React 19 + Vite + TypeScript + Tailwind v4 + Radix.

## Puesta en marcha

1. Crea un proyecto en Supabase y aplica las migraciones en orden:

   ```bash
   for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
   ```

   Opcional, datos de ejemplo: `psql "$DATABASE_URL" -f supabase/seed/sastreria_demo.sql`

2. Configura la app:

   ```bash
   cd app
   cp .env.example .env      # rellena la URL y la clave pública de tu proyecto
   npm install
   npm run dev
   ```

3. Formas de entrar (`VITE_ACCESO` en `.env`): `password`, `enlace` y `google`. Google necesita un cliente OAuth dado de alta en Supabase → Authentication → Providers.

4. Producción: `npm run build` genera `app/dist`, que se puede servir desde cualquier alojamiento estático (Cloudflare Pages, Netlify, Vercel…). Añade la dirección final en Supabase → Authentication → URL Configuration.

## Comprobaciones

- `npm run fugas` falla si aparece en la interfaz vocabulario de un sector concreto: todo lo visible debe salir de la configuración de la tienda.
- `npx tsc -b` comprueba los tipos.

## Licencia

[GNU AGPL v3](LICENSE). Si ofreces Hilo como servicio a terceros con cambios, esos cambios deben publicarse con la misma licencia.
