# README_BLOQUEO — Restrict direct access and require Portal SSO

Resumen
-------
Esta guía documenta los cambios aplicados a la app `nuevo_proyecto` para forzar que la aplicación solo sea usable cuando el usuario llega desde el portal SSO (portal.datix.cl). Si alguien intenta acceder directamente (p.ej. pegando la URL en el navegador), verá un aviso que indica que la aplicación se ha mudado al portal y un enlace para ir ahí.

Objetivos que se implementaron
-----------------------------
- Detectar el `sso_token` proveniente del portal y autenticar automáticamente en el frontend.
- Guardar información del `referrer` proveniente del SSO para poder redirigir al portal al hacer logout.
- Evitar el "flash" de la pantalla de login cuando el usuario cierra sesión (redirigir directamente al portal sin un render intermedio).
- Bloquear acceso directo a la app cuando no hay token (mostrar mensaje de migración al portal).
- Backend: pasar `sso_token` y `referrer` en la redirección para que el frontend pueda reaccionar.

¿Dónde se realizaron los cambios?
---------------------------------
- Backend (Flask): `nuevo_proyecto/backend/app.py`
  - Endpoint: `/sso/login`
  - Ahora redirige a la raíz `/` con parámetros `sso_token`, `sso_user` y `referrer`.
  - Se añadió soporte para servir `frontend_dist` (ya existente) y logging para depuración del static folder.

- Frontend (React / Vite):
  - `nuevo_proyecto/frontend/index.html` — contiene el `favicon` (logo-somyl.ico). Esto no cambia el mecanismo SSO pero es útil para replicar la apariencia.
  - `nuevo_proyecto/frontend/src/App.jsx` — cambios principales:
    - Detecta `sso_token`, `sso_user` y `referrer` en la URL *al inicializar* la app.
    - Si detecta `sso_token`, guarda el token en sesión/`sessionStorage` y marca la app como autenticada (evita ProtectedRoute redirect).
    - Guarda `sso_referrer` en `sessionStorage` para usarlo en el logout.
    - `handleLogout()` limpia el local/session storage y redirige directamente al portal usando `sso_referrer` (evita `setIsAuthenticated(false)` para que no haya flash).
    - Si no hay `sso_token` y no hay token válido, establece `accessDenied` y muestra un mensaje de aviso: "Esta aplicación se ha mudado al portal. Por favor, ingrese desde el portal oficial." con un enlace a `https://portal.datix.cl`.
  - `nuevo_proyecto/frontend/src/components/Login.jsx` — detector SSO original fue movido a `App.jsx` para que funcione en cualquier ruta.

Comportamiento de despliegue
----------------------------
- Vite copia la carpeta `public/` (donde está `logo-somyl.ico`) al `dist/` cuando construyes.
- Dockerfile copia `dist` dentro de `backend/frontend_dist` (backend sirve la carpeta resultante para que `/logo-somyl.ico` esté disponible en la raíz del dominio).
- El paso de Healthcheck en Railway (o un service) debe apuntar a `/` o `/api/health` dependiendo de si quieres validar que el frontend existe o que el backend responde.

Checklist rápido para replicar en otra app
------------------------------------------
1. Frontend (React/Vite, CRA o similar):
   - Agregar el detector SSO en el componente raíz (App) para que capture `sso_token` y `sso_user` desde la URL al arrancar:

     ```js
     // Al inicializar App
     const params = new URLSearchParams(window.location.search);
     const ssoToken = params.get('sso_token');
     const ssoUser = params.get('sso_user');
     const referrer = params.get('referrer');
     if (ssoToken) {
       setAuthToken(ssoToken);
       if (ssoUser) localStorage.setItem('rememberedEmail', ssoUser);
       if (referrer) sessionStorage.setItem('sso_referrer', referrer);
       // marcar como autenticado
     }
     ```

   - Para navegar directamente al Dashboard (o home) sin mostrar login:

     ```js
     if (ssoToken) navigate('/dashboard', { replace: true });
     ```

   - Para el logout, redirigir al portal usando el `referrer` guardado:

     ```js
     const referrer = sessionStorage.getItem('sso_referrer') || 'https://portal.datix.cl';
     window.location.href = referrer;
     ```

   - Bloquear acceso directo si no hay token:

     - Detectar en la carga si NO existe token válido ni `sso_token` y setear una bandera `accessDenied`.
     - Si `accessDenied` es true, mostrar una página con texto "Esta aplicación se ha mudado al portal..." y un botón enlazando al portal.
     - Agregar variable de entorno `VITE_PORTAL_ONLY=true` (build-time en plataformas como Railway/Vercel) para activar el modo portal-only en el frontend (chequea `import.meta.env.VITE_PORTAL_ONLY === 'true'`).

2. Backend (Flask u otro):
   - Cambiar el endpoint que recibe el SSO (ej. `/sso/login`) para que redirija a `/` incluyendo los parámetros `sso_token`, `sso_user` y `referrer`.
   - Ejemplo minimal Flask:

     ```py
     @app.route('/sso/login')
     def sso_receiver():
         token = request.args.get('token')
         referrer = request.referrer or 'https://portal.datix.cl'
         email = get_email_from_token(token)  # opcional
         return redirect(f"/?sso_token={token}&sso_user={email}&referrer={referrer}")
     ```

   - Asegúrate que el contenedor/deploy copia `dist/` en el backend y que el backend sirve esos archivos desde la raíz.
   - Agregar variable de entorno `PORTAL_ONLY=true` (runtime) para activar el bloqueo de acceso directo en el backend (sirve página de "Acceso Denegado" si no hay token SSO).

3. Build / Deploy
   - Si usas Vite: `npm run build` -> revisa `dist/` 
   - Asegúrate que el archivo final (favicon, manifest...) esté en `dist/`.
   - Copia `dist/` a la carpeta estática que tu servidor backend servirá.
   - En plataformas como Railway: Configura `VITE_PORTAL_ONLY=true` como variable de build-time (build args), y `PORTAL_ONLY=true` como variable runtime. Forzar rebuild sin cache para aplicar cambios.

4. Testing
   - Desde el portal SSO: debe redirigir a `/?sso_token=...` y la app debe entrar directamente al dashboard.
   - Acceso directo pegando la URL: debe mostrar la pantalla de "Acceso Denegado".
   - Logout: debe redirigir al portal sin mostrar login intermedio.

Recomendaciones y notas técnicas
--------------------------------
- Seguridad: este patrón asume que el SSO genera tokens y que tu app confía en esos tokens (o verificará con un backend); si confías solo en la presencia del token en el frontend, ten en cuenta que un token puede ser falsificado si no hay verificación. Idealmente el backend debería validar el token (o la app usar endpoints protegidos para confirmar el token) antes de conceder acceso a recursos sensibles.
- Cache y assets: cambia de nombre los favicon/manifests (p.ej. `logo-v2.ico`) o añade `?v=` al final para invalidar la cache del navegador.
- UX: si la app es abierta por developers o integradores, podrías añadir una lista blanca (host/ips) o un modo de debug para desarrolladores que permita acceso local directo si se activa.

¿Quieres que añada esta guía también en la raíz del repo o que la deje en la carpeta frontend? Puedo además automatizar la generación de favicon multi-resolución (avif/png/ico) y actualizar `index.html` con los tags recomendados si quieres.

---

Creado automáticamente como `nuevo_proyecto/frontend/README_BLOQUEO.md` — si quieres, hago commit y push ahora con esta guía al repo.
