# 🌸 SkinBri Shop v2 — Guía de Configuración

## Estructura de archivos

```
SkinBriShop/
├── index.html           ← Catálogo público (tienda)
├── style.css            ← Estilos del catálogo
├── app.js               ← Lógica del catálogo
├── firebase-config.js   ← ⚠️ CONFIGURA AQUÍ TUS DATOS
├── LEEME.md             ← Esta guía
└── admin/
    ├── login.html       ← Login del admin
    ├── dashboard.html   ← Panel de administración
    ├── dashboard.css    ← Estilos del panel
    └── dashboard.js     ← Lógica del panel
```

---

## PASO 1 — Crear proyecto Firebase (gratis)

1. Ve a **https://console.firebase.google.com**
2. Clic en **"Agregar proyecto"** → ponle nombre: `skinbri-shop`
3. Desactiva Google Analytics si no lo necesitas
4. Clic en **"Crear proyecto"**

---

## PASO 2 — Registrar app Web

1. En la consola → clic en el ícono **`</>`** (Web)
2. Nombre: `SkinBri Web` → clic en **"Registrar app"**
3. Copia los datos de `firebaseConfig`

---

## PASO 3 — Editar `firebase-config.js`

Abre el archivo y reemplaza los valores:

```js
const firebaseConfig = {
  apiKey:            "PEGA_TU_API_KEY",
  authDomain:        "tu-proyecto.firebaseapp.com",
  projectId:         "tu-proyecto-id",
  storageBucket:     "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123"
};
```

---

## PASO 4 — Activar Firestore

1. Firebase Console → **Firestore Database** → **"Crear base de datos"**
2. Modo: **Producción** → Región: `us-central1`
3. Pestaña **"Reglas"** → pegar esto y publicar:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /products/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /products/{id}/reviews/{r} {
      allow read: if true;
      allow write: if true;
    }
    match /banners/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /coupons/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /subscribers/{id} {
      allow read: if request.auth != null;
      allow write: if true;
    }
    match /orders/{id} {
      allow read, write: if request.auth != null;
    }
    match /settings/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## PASO 5 — Activar Storage (para imágenes)

1. Firebase Console → **Storage** → **"Comenzar"**
2. Pestaña **"Reglas"** → pegar esto y publicar:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /products/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## PASO 6 — Crear cuenta Admin

1. Firebase Console → **Authentication** → **"Comenzar"**
2. Activa: **Correo electrónico/contraseña**
3. Pestaña **"Usuarios"** → **"Agregar usuario"**
4. Ingresa tu correo y contraseña
5. ¡Listo! Usa esos datos en `/admin/login.html`

---

## PASO 7 — Personalizar tu tienda

### WhatsApp
En `app.js` línea 8:
```js
const WA_NUMBER = '51999999999'; // Tu número con código de país
// Perú: 51 + número sin 0. Ej: 51987654321
```

### Moneda
En `app.js` línea 9:
```js
const CURRENCY = 'S/'; // Cambia si es diferente
```

---

## PASO 8 — Publicar tu tienda

### Opción A — Netlify (MÁS FÁCIL, gratis)
1. Ve a **https://netlify.com** → crea cuenta gratis
2. Arrastra toda la carpeta `SkinBriShop/` al panel
3. Tu tienda queda en línea al instante con URL gratis

### Opción B — Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Public directory: .  (punto)
# Single page app: No
firebase deploy
```

### Opción C — GitHub Pages
1. Sube los archivos a un repo público
2. Settings → Pages → Source: main branch / root

---

## Lo que tiene el Catálogo Público

| Función | Descripción |
|---------|-------------|
| 🎠 Slider/Banners | Banners editables desde el admin |
| 🗂 Categorías | 8 categorías con cards visuales |
| ⭐ Destacados | Tabs: Hot, Nuevos, Ofertas |
| 🔍 Búsqueda | Buscador en tiempo real |
| 🎛 Filtros avanzados | Categoría, precio, tipo de piel, marca, orden |
| 🖼 Galería múltiple | Hasta 5 imágenes por producto en el modal |
| ⭐ Reseñas | Sistema de reseñas con estrellas en el modal |
| ⚖ Comparador | Compara hasta 4 productos lado a lado |
| 🛍 Carrito | Con cantidades, subtotal y descuentos |
| 🏷 Cupones | Aplica código de descuento en el carrito |
| 💚 WhatsApp | Pedido automático formateado con productos y total |
| ❤️ Favoritos | Guardados localmente |
| 🌿 Rutinas | Guías de rutina mañana/noche/semanal interactivas |
| 💌 Newsletter | Suscripción guardada en Firestore |
| 📡 Tiempo real | Cambios del admin se reflejan al instante |

## Lo que tiene el Panel Admin

| Módulo | Descripción |
|--------|-------------|
| 📊 Dashboard | KPIs, gráficas de categorías, alertas de stock |
| 📦 Productos | Tabla con búsqueda, filtros, editar/ocultar/eliminar |
| ➕ Nuevo Producto | Formulario completo con 5 imágenes múltiples |
| 🖼 Banners | Crear/editar/eliminar slides del hero |
| 🏷 Cupones | Porcentaje o monto fijo, vencimiento, usos máximos |
| 💌 Suscriptoras | Lista con fecha, eliminar, exportar CSV |
| 📋 Pedidos WA | Registrar pedidos manualmente, cambiar estado |
| ✏️ Sobre Nosotras | Editor de textos, redes sociales, WhatsApp |
| 🔐 Login seguro | Firebase Auth — solo tú puedes entrar |

---

## Preguntas frecuentes

**"Permission denied" en Firestore**
→ Revisa las reglas del Paso 4

**Las imágenes no suben**
→ Revisa las reglas de Storage del Paso 5

**No puedo ingresar al admin**
→ Verifica que creaste el usuario en Authentication (Paso 6)

**El catálogo no carga**
→ Verifica `firebase-config.js` con los datos correctos (Paso 3)

**Los banners no aparecen**
→ Si no hay banners en Firestore se usan los defaults. Créalos desde el admin.

---

**Hecho con 💕 para SkinBri Shop — K-Beauty Auténtico 🇰🇷**
