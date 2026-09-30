# AGENTS.md — Developer & AI Agent Guidelines (Owner Portal)

This document outlines implementation rules, architecture constraints, and data-sync protocols for autonomous AI agents and software engineers working on the **SRI SURYA TEX Owner & Administrative Portal (`surya-tex-owner`)**.

---

## 🏛️ Application Architecture & Directory Structure

```
surya-tex-owner/
├── public/
│   ├── assets/              # Branding assets: logo.png, logo.jpg, visiting_card.jpg, Lottie JSONs
│   └── favicon.ico
├── src/
│   ├── components/          # Management components
│   │   ├── AuditLogs.jsx    # Security and administrative modification audit trail
│   │   ├── BaleInfoModal.jsx# Master bale pricing & configuration popup
│   │   ├── Header.jsx       # Top navigation, products counter, price visibility toggle, logout
│   │   ├── Login.jsx        # Direct single-step admin login (Email or Visiting card mobile)
│   │   ├── OrdersManager.jsx# Wholesale indents & customer orders management
│   │   ├── ProductForm.jsx  # 2-4 photo upload & new product submission
│   │   └── ProductGrid.jsx  # Admin catalog table/grid, edit modal, quick toggles, delete
│   ├── data/
│   │   └── initialProducts.js # Seed product definitions with 2-4 photos across 4 categories
│   ├── utils/
│   │   ├── baleSlipGenerator.js # Printable packing and dispatch slip generator
│   │   ├── security.js      # XSS sanitation & login rate limiter (5 max attempts / 300s lock)
│   │   └── toast.js         # Interactive toast notification & confirmation dialog engine
│   ├── App.jsx              # Main dashboard root, session tracker & cross-origin sync
│   ├── firebase.js          # Firebase SDK initialization
│   ├── main.jsx             # React DOM entrypoint
│   └── styles.css           # Global administrative CSS design system
├── index.html               # Main HTML entry
└── vite.config.js           # Vite dev server configuration (Port 3000)
```

---

## 🔐 Authentication Guidelines (No 2-Step Verification)

1. **Allowed Identifiers**:
   - Registered Admin Email (`achudharaa@gmail.com` or `VITE_ADMIN_EMAIL`).
   - Proprietor Visiting Card Mobile (`9842686264` or `98426 86264` or `+91 98426 86264`).
2. **Password Verification**:
   - Must match `VITE_ADMIN_PASSWORD` (Default: `SriSuryaTex@2026`).
3. **Session Persistence**:
   - `sessionStorage.setItem('sst_admin_session', 'true')` and `localStorage.setItem('sst_admin_session', 'true')`.
   - Inactivity tracker automatically logs the user out after 15 minutes of idle time.
4. **MFA Constraint**:
   - Do NOT re-introduce SMS OTP, TOTP authenticator prompts, or biometric prompts. The user has explicitly mandated single-step direct authentication.

---

## 📡 Cross-Origin Central Server Sync Protocol

Because the Customer Portal runs on `http://localhost:3001` and the Admin Portal runs on `http://localhost:3000`, browser storage is isolated. Therefore, **ALL admin catalog modifications must be synchronized via HTTP to the Central Server (`http://localhost:10000`)**:

1. **Adding a Product** ([`ProductForm.jsx`](file:///e:/Github/surya-tex-owner/src/components/ProductForm.jsx)):
   - Call `POST http://localhost:10000/api/products` with the full product object.
   - Update local storage and broadcast to open admin tabs.
   - Write to Firestore `products` collection as cloud backup.
2. **Updating / Disabling / Stock Toggle** ([`ProductGrid.jsx`](file:///e:/Github/surya-tex-owner/src/components/ProductGrid.jsx)):
   - Call `PUT http://localhost:10000/api/products/:id` with updated fields.
3. **Deleting a Product** ([`ProductGrid.jsx`](file:///e:/Github/surya-tex-owner/src/components/ProductGrid.jsx)):
   - Call `DELETE http://localhost:10000/api/products/:id`.
4. **Toggling Customer Price Visibility** ([`App.jsx`](file:///e:/Github/surya-tex-owner/src/App.jsx)):
   - Call `POST http://localhost:10000/api/settings/store_config` with `{ hidePrices: boolean }`.
5. **Auto-Upload on Boot** ([`App.jsx`](file:///e:/Github/surya-tex-owner/src/App.jsx)):
   - When the app mounts, it scans local storage for items not yet recorded on the server and pushes them, ensuring no data created during offline sessions is ever lost.

---

## 📷 Multi-Photo Requirements

- Validation requires between **2 and 4 photos** before a product can be created or updated.
- Image previews must visually display angle index slots (`★ Cover`, `Angle 2`, `Angle 3`, `Angle 4`).
- Client-side compression must compress images to `maxWidth: 800px` with `quality: 0.75` before uploading.
