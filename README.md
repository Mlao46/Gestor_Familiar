# Gestor Familiar

Una app web para llevar las finanzas de casa, privada y cifrada. Se instala en el móvil y funciona también en el ordenador. Descargas el Excel de movimientos del banco, lo subes, y la app lo clasifica sola y aprende de tus correcciones.

- **Sin conexión con el banco.** Tú descargas el Excel y la app lo lee dentro del propio dispositivo.
- **Cifrado de extremo a extremo.** Los datos se cifran en el móvil o el ordenador antes de guardarse o sincronizarse. El servidor solo ve texto ilegible.
- **Compartida por la familia.** Cada uno entra con su cuenta de Google o Microsoft y desbloquea con huella, Face ID o PIN.
- **Clasificación automática.** Hay reglas base (traspasos, recibos, cajero, Bizum de regalos o cenas…), reglas que aprende cuando confirmas un movimiento y, si quieres, Claude para lo que no reconoce.
- **Gratis.** El alojamiento es GitHub Pages, la base de datos el plan gratuito de Supabase, y la IA cuesta céntimos al mes con tu clave de API de Claude.

---

## Puesta en marcha (unos 30 minutos, una sola vez)

### 1. Publicar la app en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `gestor-familiar`. Puede ser público: en él solo hay código, nunca datos.
2. Sube todos los archivos de esta carpeta a la rama `main`.
3. En **Settings › Pages**, elige *Deploy from a branch*, la rama `main` y la carpeta `/ (root)`.
4. En un minuto estará en `https://TU-USUARIO.github.io/gestor-familiar/`.

Ya puedes usarla sin servidor: los datos se quedan solo en ese dispositivo. Para instalarla en el móvil:
- **Android (Chrome):** menú › *Añadir a pantalla de inicio*.
- **iPhone (Safari):** botón Compartir › *Añadir a pantalla de inicio*.

> ⚠️ Nunca subas a GitHub el archivo `migracion.json` ni ningún Excel del banco.

### 2. Crear la base de datos en Supabase (para compartir entre dispositivos)

1. Crea una cuenta en [supabase.com](https://supabase.com) y un **New project**. Región: **Central EU (Frankfurt)**. Guarda la contraseña de la base de datos (la app no la usa).
2. Ve a **SQL Editor › New query**, pega el contenido de `supabase/esquema.sql` y pulsa **Run**.
3. En **Project Settings › API** copia:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key**

   Las dos son públicas por diseño: la seguridad la ponen el inicio de sesión, las reglas por filas del SQL y el cifrado.

### 3. Activar el inicio de sesión con Google

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto. Ve a **APIs y servicios › Pantalla de consentimiento de OAuth**, elige tipo *Externo* y pon solo el nombre de la app y tu email. En *Usuarios de prueba* añade tu email y el de tu mujer.
2. En **Credenciales › Crear credenciales › ID de cliente de OAuth**, tipo *Aplicación web*:
   - **URI de redirección autorizados:** `https://xxxx.supabase.co/auth/v1/callback`
3. Copia el *ID de cliente* y el *Secreto*.
4. En Supabase: **Authentication › Sign In / Providers › Google**. Actívalo y pega el ID y el secreto.
5. En Supabase: **Authentication › URL Configuration**:
   - **Site URL:** `https://TU-USUARIO.github.io/gestor-familiar/`
   - **Redirect URLs:** añade esa misma dirección.

Microsoft es opcional y funciona igual, con el proveedor **Azure** de Supabase y una app registrada en Microsoft Entra.

### 4. Conectar la app

1. En la app: **Ajustes › Familia y sincronización**. Pega la URL y la anon key y pulsa **Guardar y entrar con Google**.
2. Al volver, la app crea tu familia en el servidor y sube tus datos cifrados.
3. Invita a tu mujer con el email de su cuenta de Google.
4. En su móvil: abrir la app › **Unirme a mi familia** › pegar la URL y la key › entrar con Google › contraseña familiar › huella o Face ID.

### 5. (Opcional) Clasificación con IA

1. En [console.anthropic.com](https://console.anthropic.com) crea una **API key** y pon un **límite de gasto** mensual bajo (2 € sobra).
2. En la app: **Ajustes › Inteligencia artificial**. Pega la clave, actívala y pulsa *Probar conexión*.

Qué se envía: el tipo de operación, el comercio, si es cargo o abono y el importe redondeado. En los Bizum se quita el nombre de la persona. Nunca se envían saldos, cuentas ni tarjetas.

### 6. Traer los datos de la app antigua

En el ordenador donde está `mis_finanzas.db`:

```
python herramientas/migrar_sqlite.py mis_finanzas.db migracion.json
```

Después, en la app: **Ajustes › Copias de seguridad y datos › Importar datos de la app antigua**. Cuando termine, borra `migracion.json`.

---

## Uso diario

1. En la banca digital de IberCaja descarga los movimientos en Excel (el periodo da igual: lo repetido se ignora).
2. En la app, **Importar**. En Android también puedes usar *Compartir › Gestor Familiar* desde Descargas.
3. Revisa el **Buzón**. Cada movimiento que confirmas enseña una regla a la app y se aplica al resto.
4. Consulta el **Resumen** por mes, por ámbito (Familia, Wallapop, Euroimmun) y por tarjeta.

### Conceptos

| Tipo | Qué es | Cómo cuenta |
|---|---|---|
| Gasto | Dinero que sale | Suma al gasto de su categoría |
| Ingreso | Nómina, ventas… | Suma a ingresos |
| Reembolso | Te devuelven dinero de un gasto (Bizum de amigos por un regalo, devolución de una compra) | Resta del gasto de su categoría |
| Traspaso | Mover dinero entre tus cuentas | No cuenta |

Los **ámbitos** separan dinero que no es de casa. *Euroimmun* muestra lo que has gastado con la tarjeta de empresa y lo que te han devuelto, es decir, lo que te deben. *Wallapop* muestra ventas menos compras. Ninguno de los dos entra en el balance familiar.

Las **tarjetas** se detectan solas por la columna *Referencia* del Excel. Ponles nombre en Ajustes y podrás ver el gasto de cada una aunque salgan de la misma cuenta.

---

## Seguridad

- **Clave familiar.** Son 256 bits aleatorios y cifran cada registro con AES-GCM.
- **Contraseña familiar.** Protege la clave familiar (PBKDF2 con 600.000 iteraciones). Solo se pide al configurar un dispositivo nuevo.
- **Huella o Face ID.** Usa passkeys con la extensión PRF: el sistema operativo entrega un secreto solo cuando pones el dedo o la cara, y con él se descifra la clave en ese dispositivo. Si el dispositivo no lo admite, se usa un PIN.
- **Bloqueo.** La app se bloquea tras 5 minutos en segundo plano.
- **Servidor.** Supabase solo guarda `id, tipo, iv, ct, mod`. Las reglas por filas (RLS) impiden que una cuenta lea datos de otra familia.
- **Pérdida de la contraseña.** Si se olvida y no queda ningún dispositivo configurado, los datos no se pueden recuperar. Apúntala en papel y descarga de vez en cuando una **copia cifrada** (Ajustes › Copias).

**Plan gratuito de Supabase.** Si el proyecto pasa una semana sin actividad, se pausa. Con usar la app un par de veces por semana basta para evitarlo. El workflow `.github/workflows/mantener-supabase.yml` lo mantiene activo solo: añade en el repositorio los secretos `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Si aun así se pausa, se reactiva desde el panel de Supabase sin perder nada, y la app sigue funcionando sin conexión mientras tanto.

---

## Estructura del proyecto

```
index.html, manifest.webmanifest, sw.js   PWA (instalable, funciona sin conexión, recibe archivos compartidos)
css/estilos.css
js/core/        Lógica pura, sin navegador: se puede reutilizar en un servidor o en una app nativa
  xlsx.js         lector de .xlsx/.csv sin dependencias
  banco.js        convierte el extracto en movimientos (IberCaja y detección genérica de columnas)
  clasificador.js reglas base, reglas aprendidas y aprendizaje
  calculos.js     totales, desglose, evolución, cuentas aparte
  categorias.js   categorías por defecto (ids estables)
  cripto.js       cifrado, bóveda, PIN y huella (PRF)
js/almacen.js   IndexedDB cifrado + repositorio en memoria
js/sync.js      sincronización con Supabase (solo fetch)
js/servicio.js  casos de uso: importar, confirmar, aprender, IA, migración
js/ia.js        clasificación con Claude
js/app.js, vistas.js, ajustes.js, ui.js   interfaz
supabase/esquema.sql
herramientas/migrar_sqlite.py
tests/          pruebas del núcleo con datos inventados: node tests/nucleo.test.mjs
```

**Para escalar más adelante:**
- El esquema ya admite varias familias, así que podría ser un servicio para más gente.
- Añadir otro banco solo requiere tocar `banco.js`, que ya detecta columnas por nombre.
- El núcleo no depende del navegador: podría ejecutarse en un servidor o empaquetarse como app nativa.

No hay dependencias externas ni paso de compilación: lo que ves es lo que se publica.
